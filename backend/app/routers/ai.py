"""AI insight, chat companion and recommendation endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..ai_provider import chat as provider_chat
from ..config import settings
from ..database import get_db
from ..models import (
    AIInsight,
    AstronautProfile,
    ChatConversation,
    ChatMessage,
    Mission,
    MissionAssignment,
    Notification,
    Recommendation,
    RiskAssessment,
    User,
)
from ..schemas import ChatIn, RecommendationUpdateIn
from ..security import audit, ensure_astronaut_access, get_current_user
from ..serializers import insight_out, recommendation_out, risk_out
from ..services import intelligence

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.get("/status")
def ai_status(user: User = Depends(get_current_user)):
    """Transparent provider status. Never returns keys, only which provider is active."""
    provider = "mock" if (settings.llm_mock or not settings.llm_api_key) else settings.llm_provider
    return {
        "provider": provider,
        "model": settings.llm_model if provider != "mock" else "grounded-rules-v1",
        "external_ai_required_for_safety": False,
        "safety_engine": "deterministic local rules (always available)",
        "note": "Essential alerts and monitoring do not depend on any paid AI API.",
    }


def _resolve_mission_for(user: User, profile: AstronautProfile, db: Session, mission_id: int | None) -> Mission:
    if mission_id is None:
        assignment = db.scalar(
            select(MissionAssignment)
            .where(MissionAssignment.user_id == profile.user_id)
            .order_by(MissionAssignment.created_at.desc())
        )
        if not assignment:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No mission assignment")
        mission_id = assignment.mission_id
    mission = db.get(Mission, mission_id)
    if not mission:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mission not found")
    return mission


@router.post("/analyze/{astronaut_id}")
def analyze(
    astronaut_id: int,
    request: Request,
    mission_id: int | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.get(AstronautProfile, astronaut_id)
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Astronaut not found")
    ensure_astronaut_access(user, profile, db)
    mission = _resolve_mission_for(user, profile, db, mission_id)
    result = intelligence.refresh_intelligence(db, profile, mission, create_incidents=True)
    audit(db, user, "ai.analyze", "astronaut", astronaut_id, mission.code, request)
    return {
        "mission": {"id": mission.id, "name": mission.name},
        "signals": result["signals"],
        "risks": result["risks"],
        "incidents_created": result["incidents_created"],
        "pipeline": [
            "1. Deterministic safety rules (local)",
            "2. Statistical screening (z-score, trend, IsolationForest)",
            "3. Predictive estimates with uncertainty",
            "4. Explanation assembly grounded in the data above",
        ],
        "disclaimer": "Decision support only. Not a diagnosis. Predictions are estimates from simulated data.",
    }


@router.get("/insights")
def insights(
    astronaut_id: int,
    mission_id: int | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.get(AstronautProfile, astronaut_id)
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Astronaut not found")
    ensure_astronaut_access(user, profile, db)
    q = select(AIInsight).where(AIInsight.astronaut_id == astronaut_id)
    if mission_id:
        q = q.where(AIInsight.mission_id == mission_id)
    rows = list(db.scalars(q.order_by(AIInsight.created_at.desc()).limit(60)).all())
    risks = list(
        db.scalars(select(RiskAssessment).where(RiskAssessment.astronaut_id == astronaut_id)).all()
    )
    return {
        "insights": [insight_out(i) for i in rows],
        "risks": [risk_out(r) for r in risks],
        "note": "Every insight records data_class (measured/simulated/derived/predicted) and its limitations.",
    }


@router.get("/recommendations")
def recommendations(
    astronaut_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.get(AstronautProfile, astronaut_id)
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Astronaut not found")
    ensure_astronaut_access(user, profile, db)
    rows = list(
        db.scalars(
            select(Recommendation)
            .where(Recommendation.astronaut_id == astronaut_id)
            .order_by(Recommendation.created_at.desc())
        ).all()
    )
    return {"recommendations": [recommendation_out(r) for r in rows]}


@router.patch("/recommendations/{recommendation_id}")
def update_recommendation(
    recommendation_id: int,
    payload: RecommendationUpdateIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.get(Recommendation, recommendation_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recommendation not found")
    profile = db.get(AstronautProfile, row.astronaut_id)
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Astronaut not found")
    if user.role == "astronaut" and profile.user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You may only update your own plan")
    if user.role not in ("astronaut", "medical", "mission_control"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permission")
    if user.role != "astronaut":
        ensure_astronaut_access(user, profile, db)
    if payload.status:
        row.status = payload.status
    if payload.adherence is not None:
        row.adherence = payload.adherence
    db.commit()
    audit(db, user, "recommendation.update", "recommendation", row.id, row.status, request)
    return recommendation_out(row)


@router.get("/conversations")
def conversations(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Only the owning astronaut can list their private conversations."""
    if user.role != "astronaut":
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Private companion conversations are not accessible to this role",
        )
    profile = db.scalar(select(AstronautProfile).where(AstronautProfile.user_id == user.id))
    if not profile:
        return {"conversations": []}
    rows = list(
        db.scalars(
            select(ChatConversation)
            .where(ChatConversation.astronaut_id == profile.id)
            .order_by(ChatConversation.updated_at.desc())
        ).all()
    )
    return {
        "conversations": [
            {
                "id": c.id,
                "title": c.title,
                "updated_at": c.updated_at.isoformat(),
                "messages": [
                    {
                        "id": m.id,
                        "role": m.role,
                        "content": m.content,
                        "meta": m.meta,
                        "created_at": m.created_at.isoformat(),
                    }
                    for m in c.messages
                ],
            }
            for c in rows
        ],
        "privacy": "These conversations are visible only to you. No other role has an endpoint that reads them.",
    }


@router.post("/chat")
def chat(
    payload: ChatIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role != "astronaut":
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "The private companion is available to astronaut accounts only",
        )
    profile = db.scalar(select(AstronautProfile).where(AstronautProfile.user_id == user.id))
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No astronaut profile")
    mission = _resolve_mission_for(user, profile, db, None)

    conversation = None
    if payload.conversation_id:
        conversation = db.get(ChatConversation, payload.conversation_id)
        if not conversation or conversation.astronaut_id != profile.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    if not conversation:
        conversation = ChatConversation(
            astronaut_id=profile.id,
            title=payload.message[:60] or "New conversation",
        )
        db.add(conversation)
        db.flush()

    db.add(ChatMessage(conversation_id=conversation.id, role="user", content=payload.message))
    db.commit()

    context = intelligence.astronaut_context_payload(db, profile, mission)
    context["conversation_history_omitted"] = True
    result = provider_chat([{"role": "user", "content": payload.message}], context)

    meta = {
        "provider": result["provider"],
        "model": result["model"],
        "fallback": result["fallback"],
        "safety_escalation": result["safety_escalation"],
        "data_classes_used": ["simulated", "derived", "predicted"],
    }
    db.add(
        ChatMessage(conversation_id=conversation.id, role="assistant", content=result["reply"], meta=meta)
    )
    conversation.updated_at = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
    db.commit()

    if result["safety_escalation"]:
        # Transparent, minimal escalation: clinicians see that a safety protocol
        # triggered, never the conversation content. The astronaut is told.
        for staff in db.scalars(
            select(MissionAssignment.user_id).where(MissionAssignment.mission_id == mission.id)
        ).all():
            staff_user = db.get(User, staff)
            if staff_user and staff_user.role == "medical":
                db.add(
                    Notification(
                        user_id=staff,
                        title=f"Safety protocol triggered — {profile.callsign}",
                        body="A private companion conversation triggered the safety escalation policy. "
                        "Conversation content is not shared. Please make contact through the medical channel.",
                        level="critical",
                        link="/app/incidents",
                    )
                )
        db.commit()

    return {
        "conversation_id": conversation.id,
        "reply": result["reply"],
        "provider": result["provider"],
        "model": result["model"],
        "fallback": result["fallback"],
        "safety_escalation": result["safety_escalation"],
        "privacy_note": "This conversation is private to you and is not visible to Mission Control or administrators.",
    }


@router.delete("/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role != "astronaut":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not permitted")
    profile = db.scalar(select(AstronautProfile).where(AstronautProfile.user_id == user.id))
    conversation = db.get(ChatConversation, conversation_id)
    if not conversation or not profile or conversation.astronaut_id != profile.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    db.delete(conversation)
    db.commit()
    return {"ok": True}
