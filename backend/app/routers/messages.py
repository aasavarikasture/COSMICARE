"""In-application communication centre and notifications.

Communicates between simulated participants inside COSMICARE only. It does not
represent real spacecraft communication.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Incident, Message, Mission, MissionAssignment, Notification, User
from ..schemas import MessageIn
from ..security import audit, ensure_mission_access, get_current_user
from ..serializers import notification_out

router = APIRouter(prefix="/api", tags=["communication"])


def _mission_user_ids(mission_id: int, db: Session) -> set[int]:
    return set(
        db.scalars(
            select(MissionAssignment.user_id).where(
                MissionAssignment.mission_id == mission_id, MissionAssignment.is_active.is_(True)
            )
        ).all()
    )


def _message_out(m: Message, db: Session) -> dict:
    sender = db.get(User, m.sender_id)
    return {
        "id": m.id,
        "mission_id": m.mission_id,
        "sender_id": m.sender_id,
        "sender_name": sender.full_name if sender else "",
        "sender_role": sender.role if sender else "",
        "recipient_id": m.recipient_id,
        "incident_id": m.incident_id,
        "channel": m.channel,
        "priority": m.priority,
        "body": m.body,
        "delivered_at": m.delivered_at.isoformat() if m.delivered_at else None,
        "read_at": m.read_at.isoformat() if m.read_at else None,
        "acknowledged_at": m.acknowledged_at.isoformat() if m.acknowledged_at else None,
        "created_at": m.created_at.isoformat(),
    }


@router.get("/messages")
def list_messages(
    mission_id: int,
    channel: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ensure_mission_access(user, mission_id, db)
    q = select(Message).where(Message.mission_id == mission_id)
    if channel:
        q = q.where(Message.channel == channel)
    rows = list(db.scalars(q.order_by(Message.created_at).limit(300)).all())
    visible = []
    for m in rows:
        if m.channel == "announcement" or m.channel == "emergency":
            visible.append(m)
        elif m.sender_id == user.id or m.recipient_id in (None, user.id):
            visible.append(m)
    return {
        "messages": [_message_out(m, db) for m in visible],
        "channel_note": "Simulated in-app communication between demo participants.",
    }


@router.post("/messages", status_code=201)
def send_message(
    payload: MessageIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    mission = db.get(Mission, payload.mission_id)
    if not mission:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mission not found")
    ensure_mission_access(user, payload.mission_id, db)

    if payload.channel in ("announcement",) and user.role not in ("medical", "mission_control"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only Mission Control or medical staff can announce")
    if payload.channel == "incident" and not payload.incident_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Incident channel requires an incident_id")
    if payload.incident_id:
        incident = db.get(Incident, payload.incident_id)
        if not incident or incident.mission_id != payload.mission_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Incident not found for this mission")
    if payload.client_uuid:
        existing = db.scalar(select(Message).where(Message.client_uuid == payload.client_uuid))
        if existing:
            return _message_out(existing, db)
    if payload.recipient_id is not None and payload.recipient_id not in _mission_user_ids(
        payload.mission_id, db
    ):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Recipient is not assigned to this mission")

    message = Message(
        mission_id=payload.mission_id,
        sender_id=user.id,
        recipient_id=payload.recipient_id,
        incident_id=payload.incident_id,
        channel=payload.channel,
        priority=payload.priority,
        body=payload.body,
        delivered_at=datetime.now(timezone.utc),
        client_uuid=payload.client_uuid,
    )
    db.add(message)
    db.flush()

    targets = (
        [payload.recipient_id]
        if payload.recipient_id
        else [
            uid
            for uid in _mission_user_ids(payload.mission_id, db)
            if uid != user.id
        ]
    )
    for uid in targets:
        db.add(
            Notification(
                user_id=uid,
                title=f"{'Emergency' if payload.channel == 'emergency' else 'New message'} from {user.full_name}",
                body=payload.body[:200],
                level="critical" if payload.priority == "urgent" or payload.channel == "emergency" else "info",
                link=f"/app/communication?mission={payload.mission_id}",
            )
        )
    db.commit()
    audit(db, user, "message.send", "message", message.id, payload.channel, request)
    return _message_out(message, db)


@router.post("/messages/{message_id}/acknowledge")
def acknowledge_message(
    message_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    message = db.get(Message, message_id)
    if not message:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    ensure_mission_access(user, message.mission_id, db)
    if message.recipient_id not in (None, user.id) or message.sender_id == user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a recipient of this message")
    message.acknowledged_at = datetime.now(timezone.utc)
    message.read_at = message.read_at or datetime.now(timezone.utc)
    db.commit()
    return {"ok": True, "acknowledged_at": message.acknowledged_at.isoformat()}


@router.get("/notifications")
def notifications(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    rows = list(
        db.scalars(
            select(Notification)
            .where(Notification.user_id == user.id)
            .order_by(Notification.created_at.desc())
            .limit(60)
        ).all()
    )
    return {
        "notifications": [notification_out(n) for n in rows],
        "unread": sum(1 for n in rows if n.read_at is None),
    }


@router.post("/notifications/{notification_id}/read")
def mark_read(
    notification_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    n = db.get(Notification, notification_id)
    if not n or n.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    n.read_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


@router.post("/messages/sync")
def sync_offline(
    payload: dict,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Conflict-aware offline sync for queued messages and assessments.

    Client sends items created while offline. Duplicate client_uuid values are
    accepted once; the response reports which items were applied and which were
    deduplicated, so the client can safely retry.
    """
    items = payload.get("messages", []) if isinstance(payload, dict) else []
    applied, deduplicated, rejected = [], [], []
    for item in items:
        try:
            mission_id = int(item["mission_id"])
            ensure_mission_access(user, mission_id, db)
            uuid = item.get("client_uuid")
            if uuid and db.scalar(select(Message).where(Message.client_uuid == uuid)):
                deduplicated.append(uuid)
                continue
            msg = Message(
                mission_id=mission_id,
                sender_id=user.id,
                recipient_id=item.get("recipient_id"),
                channel=item.get("channel", "direct"),
                priority=item.get("priority", "normal"),
                body=str(item.get("body", ""))[:4000],
                delivered_at=datetime.now(timezone.utc),
                client_uuid=uuid,
            )
            db.add(msg)
            db.flush()
            applied.append({"client_uuid": uuid, "id": msg.id, "created_at": msg.created_at.isoformat()})
        except Exception as exc:
            rejected.append({"item": item.get("client_uuid"), "reason": "Invalid message item"})
    db.commit()
    audit(db, user, "offline.sync", "message", "", f"applied={len(applied)}", request)
    return {
        "applied": applied,
        "deduplicated": deduplicated,
        "rejected": rejected,
        "conflict_policy": "client_uuid idempotency; server timestamp wins for ordering",
    }
