"""Authentication, session and privacy preference endpoints."""
from __future__ import annotations

import secrets
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import AstronautProfile, MedicalProfile, PrivacyPreference, User
from ..schemas import (
    LoginIn,
    PasswordResetConfirmIn,
    PasswordResetRequestIn,
    PrivacyIn,
    RegisterIn,
)
from ..security import (
    audit,
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from ..serializers import user_out

router = APIRouter(prefix="/api/auth", tags=["auth"])

_attempts: dict[str, deque] = defaultdict(deque)
WINDOW = 60
MAX_ATTEMPTS = 8


def _rate_limit(key: str) -> None:
    now = time.time()
    q = _attempts[key]
    while q and now - q[0] > WINDOW:
        q.popleft()
    if len(q) >= MAX_ATTEMPTS:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts. Try again shortly.")
    q.append(now)


def _privacy_for(db: Session, user: User) -> PrivacyPreference:
    pref = db.scalar(select(PrivacyPreference).where(PrivacyPreference.user_id == user.id))
    if not pref:
        pref = PrivacyPreference(user_id=user.id)
        db.add(pref)
        db.commit()
    return pref


@router.post("/register", status_code=201)
def register(payload: RegisterIn, request: Request, db: Session = Depends(get_db)):
    _rate_limit(f"register:{request.client.host if request.client else 'unknown'}")
    if db.scalar(select(User).where(User.email == payload.email.lower())):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")

    if payload.role in ("mission_control", "admin"):
        if settings.environment != "development" and payload.invite_code != settings.demo_invite_code:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "An invite code is required for this role")
        if settings.environment == "development" and payload.invite_code not in (None, "", settings.demo_invite_code):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Invalid invite code")

    user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        full_name=payload.full_name.strip(),
        role=payload.role,
    )
    db.add(user)
    db.flush()

    if payload.role == "astronaut":
        callsign = (payload.callsign or payload.full_name.split()[0]).upper()[:24]
        db.add(
            AstronautProfile(
                user_id=user.id,
                callsign=callsign,
                readiness={"physical": 80, "mental": 80, "sleep": 80, "note": "Self-reported at registration"},
            )
        )
    elif payload.role == "medical":
        db.add(MedicalProfile(user_id=user.id))
    db.add(PrivacyPreference(user_id=user.id))
    db.commit()
    audit(db, user, "auth.register", "user", user.id, f"role={user.role}", request)
    return {"user": user_out(user), "token": create_access_token(user), "token_type": "bearer"}


@router.post("/login")
def login(payload: LoginIn, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "unknown"
    _rate_limit(f"login:{ip}")
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not verify_password(payload.password, user.password_hash):
        audit(db, None, "auth.login_failed", "user", "", payload.email[:120], request)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account disabled")
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    audit(db, user, "auth.login", "user", user.id, "", request)
    return {"user": user_out(user), "token": create_access_token(user), "token_type": "bearer"}


@router.post("/logout")
def logout(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    audit(db, user, "auth.logout", "user", user.id, "client discarded token", request)
    return {"ok": True, "note": "Stateless JWT discarded client-side."}


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    data = {"user": user_out(user), "privacy": None, "astronaut_profile": None}
    pref = _privacy_for(db, user)
    data["privacy"] = {
        "share_mood_summary": pref.share_mood_summary,
        "share_assessment_notes": pref.share_assessment_notes,
        "share_ai_chat": False,
        "allow_research_use": pref.allow_research_use,
    }
    if user.role == "astronaut":
        profile = db.scalar(select(AstronautProfile).where(AstronautProfile.user_id == user.id))
        if profile:
            data["astronaut_profile"] = {"id": profile.id, "callsign": profile.callsign}
    return data


@router.put("/privacy")
def update_privacy(
    payload: PrivacyIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pref = _privacy_for(db, user)
    pref.share_mood_summary = payload.share_mood_summary
    pref.share_assessment_notes = payload.share_assessment_notes
    # AI conversations and journals stay private by default; this build provides
    # no endpoint that shares raw chat transcripts with other roles.
    pref.allow_research_use = payload.allow_research_use
    db.commit()
    audit(db, user, "privacy.update", "privacy_preference", pref.id, "", request)
    return {
        "share_mood_summary": pref.share_mood_summary,
        "share_assessment_notes": pref.share_assessment_notes,
        "share_ai_chat": False,
        "allow_research_use": pref.allow_research_use,
    }


@router.post("/password-reset")
def request_password_reset(payload: PasswordResetRequestIn, request: Request, db: Session = Depends(get_db)):
    _rate_limit(f"reset:{request.client.host if request.client else 'unknown'}")
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    response: dict = {"ok": True, "message": "If the account exists, a reset token has been issued."}
    if user:
        user.reset_token = secrets.token_urlsafe(32)
        user.reset_expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
        db.commit()
        audit(db, user, "auth.password_reset_requested", "user", user.id, "", request)
        # No email service is configured for the hackathon build. In development
        # the token is returned so the flow is demonstrable; production returns none.
        if settings.environment == "development":
            response["demo_token"] = user.reset_token
            response["note"] = "Development build: token returned because no email provider is configured."
    return response


@router.post("/password-reset/confirm")
def confirm_password_reset(payload: PasswordResetConfirmIn, request: Request, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.reset_token == payload.token))
    if not user or not user.reset_expires_at:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired reset token")
    expires = user.reset_expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Reset token expired")
    user.password_hash = hash_password(payload.password)
    user.reset_token = None
    user.reset_expires_at = None
    db.commit()
    audit(db, user, "auth.password_reset_completed", "user", user.id, "", request)
    return {"ok": True}
