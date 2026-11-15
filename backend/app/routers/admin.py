"""Administrative account, role, assignment and audit management.

Administrators manage accounts and configuration. They deliberately have no
endpoint that returns clinical readings or private conversations.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import (
    AstronautProfile,
    AuditLog,
    MedicalProfile,
    Mission,
    MissionAssignment,
    PrivacyPreference,
    User,
)
from ..schemas import RegisterIn
from ..security import audit, hash_password, require_roles
from ..serializers import iso, mission_out, user_out

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users")
def users(user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    rows = list(db.scalars(select(User).order_by(User.id)).all())
    assignments = list(db.scalars(select(MissionAssignment)).all())
    missions = {m.id: m.name for m in db.scalars(select(Mission)).all()}
    return {
        "users": [
            {
                **user_out(u),
                "assignments": [
                    {"mission_id": a.mission_id, "mission": missions.get(a.mission_id), "role": a.role_on_mission}
                    for a in assignments
                    if a.user_id == u.id
                ],
            }
            for u in rows
        ]
    }


@router.post("/users", status_code=201)
def create_user(
    payload: RegisterIn,
    request: Request,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    if db.scalar(select(User).where(User.email == payload.email.lower())):
        raise HTTPException(status.HTTP_409_CONFLICT, "Account already exists")
    target = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
    )
    db.add(target)
    db.flush()
    if payload.role == "astronaut":
        db.add(
            AstronautProfile(
                user_id=target.id,
                callsign=(payload.callsign or payload.full_name.split()[0]).upper()[:24],
                readiness={"physical": 80, "mental": 80, "sleep": 80},
            )
        )
    elif payload.role == "medical":
        db.add(MedicalProfile(user_id=target.id))
    db.add(PrivacyPreference(user_id=target.id))
    db.commit()
    audit(db, user, "admin.user_create", "user", target.id, target.role, request)
    return user_out(target)


@router.patch("/users/{user_id}")
def update_user(
    user_id: int,
    payload: dict,
    request: Request,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if target.id == user.id and payload.get("is_active") is False:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot disable your own account")
    if "is_active" in payload:
        target.is_active = bool(payload["is_active"])
    if "role" in payload:
        if payload["role"] not in ("astronaut", "medical", "mission_control", "admin"):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid role")
        target.role = payload["role"]
    if "full_name" in payload and payload["full_name"]:
        target.full_name = str(payload["full_name"])[:160]
    db.commit()
    audit(db, user, "admin.user_update", "user", target.id, str(payload)[:200], request)
    return user_out(target)


@router.get("/missions")
def missions(user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    rows = list(db.scalars(select(Mission).order_by(Mission.created_at.desc())).all())
    return {
        "missions": [mission_out(m, db) for m in rows],
        "note": "Crew names are shown for assignment administration only; clinical records are not accessible here.",
    }


@router.get("/audit")
def audit_logs(
    limit: int = 100,
    action: str | None = None,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    q = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(min(limit, 500))
    if action:
        q = q.where(AuditLog.action.like(f"{action}%"))
    rows = list(db.scalars(q).all())
    return {
        "logs": [
            {
                "id": r.id,
                "actor_id": r.actor_id,
                "actor_role": r.actor_role,
                "action": r.action,
                "entity": r.entity,
                "entity_id": r.entity_id,
                "detail": r.detail,
                "ip": r.ip,
                "created_at": iso(r.created_at),
            }
            for r in rows
        ]
    }


@router.get("/system")
def system(user: User = Depends(require_roles("admin"))):
    return {
        "environment": settings.environment,
        "database": settings.database_url.split("://")[0] + "://***",
        "llm_provider": "mock" if settings.llm_mock else settings.llm_provider,
        "llm_configured": bool(settings.llm_api_key),
        "space_weather_enabled": settings.space_weather_enabled,
        "secrets_exposed": False,
        "notes": [
            "Provider keys are read server-side only and never returned by any endpoint.",
            "Administrators cannot read clinical records, journals or AI conversations.",
            "Emergency access by administrators is not implemented; escalation runs through clinical roles.",
        ],
    }
