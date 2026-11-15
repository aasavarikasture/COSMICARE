"""Password hashing, JWT handling and role/mission-scoped authorization."""
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import AuditLog, AstronautProfile, MissionAssignment, User

bearer = HTTPBearer(auto_error=False)

ROLES = ("astronaut", "medical", "mission_control", "admin")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "email": user.email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required")
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id = int(payload.get("sub", "0"))
    except (JWTError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session")
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account unavailable")
    return user


def require_roles(*roles: str):
    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permission")
        return user

    return checker


def audit(
    db: Session,
    actor: User | None,
    action: str,
    entity: str = "",
    entity_id: str | int = "",
    detail: str = "",
    request: Request | None = None,
    commit: bool = True,
) -> None:
    entry = AuditLog(
        actor_id=actor.id if actor else None,
        actor_role=actor.role if actor else "",
        action=action,
        entity=entity,
        entity_id=str(entity_id),
        detail=detail,
        ip=(request.client.host if request and request.client else ""),
    )
    db.add(entry)
    if commit:
        db.commit()


def astronaut_profile_for(user: User, db: Session) -> AstronautProfile:
    profile = db.scalar(select(AstronautProfile).where(AstronautProfile.user_id == user.id))
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No astronaut profile linked to this account")
    return profile


def assigned_mission_ids(user: User, db: Session) -> list[int]:
    rows = db.scalars(
        select(MissionAssignment.mission_id).where(
            MissionAssignment.user_id == user.id, MissionAssignment.is_active.is_(True)
        )
    ).all()
    return list(rows)


def ensure_mission_access(user: User, mission_id: int, db: Session, write: bool = False) -> None:
    """Role-aware mission authorization.

    Astronauts: own mission only. Medical/crew-control: assigned missions only.
    Admin: mission administration, deliberately NOT clinical record access.
    """
    if user.role == "admin":
        if write:
            return
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Administrator accounts cannot access clinical mission records",
        )
    if user.role == "astronaut":
        profile = db.scalar(select(AstronautProfile).where(AstronautProfile.user_id == user.id))
        if not profile:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No astronaut profile")
        ok = db.scalar(
            select(MissionAssignment.id).where(
                MissionAssignment.user_id == user.id,
                MissionAssignment.mission_id == mission_id,
                MissionAssignment.is_active.is_(True),
            )
        )
        if not ok:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not assigned to this mission")
        return
    if mission_id not in assigned_mission_ids(user, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not assigned to this mission")


def ensure_astronaut_access(user: User, astronaut: AstronautProfile, db: Session) -> None:
    """Astronauts may read themselves; clinical staff must share a mission."""
    if user.role == "astronaut":
        if astronaut.user_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Astronauts may only access their own records")
        return
    if user.role == "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Administrator accounts cannot access clinical records")
    if user.role not in ("medical", "mission_control"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permission")

    # Access requires that the clinician and the astronaut share a mission.
    a_mission_ids = set(
        db.scalars(
            select(MissionAssignment.mission_id).where(
                MissionAssignment.user_id == astronaut.user_id
            )
        ).all()
    )
    my_mission_ids = set(assigned_mission_ids(user, db))
    if not a_mission_ids & my_mission_ids:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No shared mission assignment")
