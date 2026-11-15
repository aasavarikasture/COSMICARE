"""Emergency incident lifecycle with a full audit trail."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    AstronautProfile,
    Incident,
    IncidentEvent,
    Mission,
    MissionAssignment,
    Notification,
    User,
)
from ..schemas import IncidentIn, IncidentUpdateIn
from ..security import audit, ensure_mission_access, get_current_user
from ..serializers import incident_out

router = APIRouter(prefix="/api/incidents", tags=["incidents"])

OPEN_STATUSES = ("new", "acknowledged", "under_review", "action_required")


def _own_profile(user: User, db: Session) -> AstronautProfile | None:
    return db.scalar(select(AstronautProfile).where(AstronautProfile.user_id == user.id))


def _can_view(user: User, incident: Incident, db: Session) -> bool:
    if user.role == "admin":
        return False
    profile = _own_profile(user, db)
    if user.role == "astronaut":
        return bool(profile and incident.astronaut_id == profile.id)
    ids = set(
        db.scalars(
            select(MissionAssignment.mission_id).where(MissionAssignment.user_id == user.id)
        ).all()
    )
    return incident.mission_id in ids


def _scope_query(user: User, db: Session):
    q = select(Incident)
    if user.role == "admin":
        return q.where(Incident.id == -1)
    if user.role == "astronaut":
        profile = _own_profile(user, db)
        return q.where(Incident.astronaut_id == (profile.id if profile else -1))
    ids = db.scalars(
        select(MissionAssignment.mission_id).where(MissionAssignment.user_id == user.id)
    ).all()
    return q.where(Incident.mission_id.in_(ids or [-1]))


def _notify_staff(db: Session, mission_id: int, title: str, body: str, level: str, link: str) -> None:
    for assignment in db.scalars(
        select(MissionAssignment).where(MissionAssignment.mission_id == mission_id)
    ).all():
        if assignment.user_id:
            db.add(
                Notification(
                    user_id=assignment.user_id, title=title, body=body, level=level, link=link
                )
            )


@router.get("")
def list_incidents(
    mission_id: int | None = None,
    status_filter: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = _scope_query(user, db)
    if mission_id:
        q = q.where(Incident.mission_id == mission_id)
    if status_filter:
        q = q.where(Incident.status == status_filter)
    rows = list(db.scalars(q.order_by(Incident.created_at.desc()).limit(200)).all())
    return {
        "incidents": [incident_out(i, db) for i in rows],
        "open_count": sum(1 for i in rows if i.status in OPEN_STATUSES),
    }


@router.post("", status_code=201)
def create_incident(
    payload: IncidentIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    mission = db.get(Mission, payload.mission_id)
    if not mission:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mission not found")

    astronaut_id = payload.astronaut_id
    if user.role == "astronaut":
        profile = _own_profile(user, db)
        if not profile:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No astronaut profile")
        ensure_mission_access(user, mission.id, db)
        astronaut_id = profile.id
    elif user.role in ("medical", "mission_control"):
        ensure_mission_access(user, mission.id, db)
    else:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Administrator accounts cannot create clinical incidents")

    incident = Incident(
        mission_id=mission.id,
        astronaut_id=astronaut_id,
        source=payload.source,
        severity=payload.severity,
        title=payload.title,
        description=payload.description,
        status="new",
    )
    db.add(incident)
    db.flush()
    db.add(
        IncidentEvent(
            incident_id=incident.id, actor_id=user.id, action="created", note=f"Reported by {user.role}"
        )
    )
    _notify_staff(
        db,
        mission.id,
        f"{payload.severity.upper()} incident: {payload.title}",
        payload.description[:280],
        "critical" if payload.severity in ("high", "critical") else "warning",
        f"/app/incidents/{incident.id}",
    )
    db.commit()
    audit(db, user, "incident.create", "incident", incident.id, incident.title, request)
    return incident_out(incident, db)


@router.get("/{incident_id}")
def get_incident(
    incident_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    incident = db.get(Incident, incident_id)
    if not incident:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Incident not found")
    if not _can_view(user, incident, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorized for this incident")
    data = incident_out(incident, db)
    data["mission"] = (
        {"id": incident.mission_id, "name": db.get(Mission, incident.mission_id).name}
        if db.get(Mission, incident.mission_id)
        else None
    )
    if incident.astronaut_id:
        profile = db.get(AstronautProfile, incident.astronaut_id)
        data["astronaut"] = {"id": profile.id, "callsign": profile.callsign} if profile else None
    return data


@router.post("/{incident_id}/acknowledge")
def acknowledge(
    incident_id: int,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    incident = db.get(Incident, incident_id)
    if not incident:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Incident not found")
    if user.role not in ("medical", "mission_control"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only clinical or Mission Control staff can acknowledge")
    if not _can_view(user, incident, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not assigned to this mission")
    incident.status = "acknowledged"
    incident.acknowledged_at = datetime.now(timezone.utc)
    incident.assigned_to = incident.assigned_to or user.id
    db.add(IncidentEvent(incident_id=incident.id, actor_id=user.id, action="acknowledged", note=""))
    db.commit()
    audit(db, user, "incident.acknowledge", "incident", incident.id, "", request)
    return incident_out(incident, db)


@router.patch("/{incident_id}")
def update_incident(
    incident_id: int,
    payload: IncidentUpdateIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    incident = db.get(Incident, incident_id)
    if not incident:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Incident not found")
    if user.role not in ("medical", "mission_control"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only clinical or Mission Control staff can update")
    if not _can_view(user, incident, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not assigned to this mission")

    if payload.status:
        incident.status = payload.status
        if payload.status == "acknowledged" and not incident.acknowledged_at:
            incident.acknowledged_at = datetime.now(timezone.utc)
    if payload.severity:
        incident.severity = payload.severity
    if payload.assigned_to is not None:
        incident.assigned_to = payload.assigned_to
    if payload.resolution_summary:
        incident.resolution_summary = payload.resolution_summary
    if payload.status == "resolved":
        incident.resolved_at = datetime.now(timezone.utc)
        if not incident.resolution_summary:
            incident.resolution_summary = payload.note or "Resolved by clinical staff."
    db.add(
        IncidentEvent(
            incident_id=incident.id,
            actor_id=user.id,
            action=payload.status or "updated",
            note=payload.note or "",
        )
    )
    db.commit()
    audit(db, user, "incident.update", "incident", incident.id, payload.status or "", request)
    return incident_out(incident, db)


@router.post("/{incident_id}/resolve")
def resolve(
    incident_id: int,
    payload: IncidentUpdateIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    payload.status = "resolved"
    return update_incident(incident_id, payload, request, user, db)
