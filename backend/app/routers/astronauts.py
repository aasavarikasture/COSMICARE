"""Astronaut profiles, health records, baselines, assessments and timeline."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import analytics, simulation
from ..database import get_db
from ..models import (
    AIInsight,
    Assessment,
    AstronautProfile,
    HealthBaseline,
    HealthObservation,
    Mission,
    MissionAssignment,
    Recommendation,
    RiskAssessment,
    User,
)
from ..reference import REFERENCE_RANGES
from ..schemas import AssessmentIn, BaselineIn
from ..security import (
    audit,
    ensure_astronaut_access,
    get_current_user,
    require_roles,
)
from ..serializers import astronaut_out, insight_out, recommendation_out, risk_out, snapshot_out
from ..services import intelligence

router = APIRouter(prefix="/api/astronauts", tags=["astronauts"])


def _visible_astronauts(user: User, db: Session) -> list[AstronautProfile]:
    if user.role == "admin":
        return []
    if user.role == "astronaut":
        return list(
            db.scalars(select(AstronautProfile).where(AstronautProfile.user_id == user.id)).all()
        )
    my_missions = set(
        db.scalars(
            select(MissionAssignment.mission_id).where(MissionAssignment.user_id == user.id)
        ).all()
    )
    if not my_missions:
        return []
    user_ids = set(
        db.scalars(
            select(MissionAssignment.user_id).where(MissionAssignment.mission_id.in_(my_missions))
        ).all()
    )
    return list(
        db.scalars(select(AstronautProfile).where(AstronautProfile.user_id.in_(user_ids))).all()
    )


@router.get("")
def list_astronauts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profiles = _visible_astronauts(user, db)
    return {
        "astronauts": [astronaut_out(p, db) for p in profiles],
        "note": "Administrators manage accounts but cannot read clinical records.",
    }


@router.get("/{astronaut_id}")
def get_astronaut(
    astronaut_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.get(AstronautProfile, astronaut_id)
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Astronaut not found")
    ensure_astronaut_access(user, profile, db)
    data = astronaut_out(profile, db)
    data["baselines"] = [
        {
            "id": b.id,
            "metric": b.metric,
            "value": b.value,
            "unit": b.unit,
            "method": b.method,
            "note": b.note,
            "recorded_at": b.created_at.isoformat(),
        }
        for b in db.scalars(
            select(HealthBaseline).where(HealthBaseline.astronaut_id == profile.id)
        ).all()
    ]
    return data


def _resolve_mission(user: User, profile: AstronautProfile, db: Session, mission_id: int | None) -> Mission:
    if mission_id is None:
        assignment = db.scalar(
            select(MissionAssignment)
            .where(MissionAssignment.user_id == profile.user_id)
            .order_by(MissionAssignment.created_at.desc())
        )
        if not assignment:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Astronaut has no mission assignment")
        mission_id = assignment.mission_id
    mission = db.get(Mission, mission_id)
    if not mission:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mission not found")
    ensure_astronaut_access(user, profile, db)
    return mission


@router.get("/{astronaut_id}/health")
def health(
    astronaut_id: int,
    mission_id: int | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.get(AstronautProfile, astronaut_id)
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Astronaut not found")
    mission = _resolve_mission(user, profile, db, mission_id)
    ctx = intelligence.latest_context(db, profile, mission)
    snapshots = ctx["snapshots"]
    latest = snapshots[-1] if snapshots else None

    # Observational privacy: mood detail is only shared when the astronaut opted in.
    pref = profile.user.privacy if profile.user else None
    mood_shared = bool(pref and pref.share_mood_summary)
    if user.role == "mission_control" and not mood_shared:
        assessments = [a for a in ctx["assessments"] if a.kind == "physical"]
    elif user.role != "astronaut":
        assessments = [a for a in ctx["assessments"] if a.kind == "physical"] if not mood_shared else ctx["assessments"]
    else:
        assessments = ctx["assessments"]

    insights = list(
        db.scalars(
            select(AIInsight)
            .where(AIInsight.astronaut_id == profile.id, AIInsight.mission_id == mission.id)
            .order_by(AIInsight.created_at.desc())
            .limit(30)
        ).all()
    )
    risks = list(
        db.scalars(
            select(RiskAssessment).where(
                RiskAssessment.astronaut_id == profile.id, RiskAssessment.mission_id == mission.id
            )
        ).all()
    )
    recommendations = list(
        db.scalars(
            select(Recommendation)
            .where(Recommendation.astronaut_id == profile.id, Recommendation.mission_id == mission.id)
            .order_by(Recommendation.created_at.desc())
        ).all()
    )
    observations = [
        {
            "metric": o.metric,
            "value": o.value,
            "unit": o.unit,
            "method": o.method,
            "source_ref": o.source_ref,
            "recorded_at": o.recorded_at.isoformat(),
        }
        for o in ctx["observations"]
    ]
    return {
        "astronaut": astronaut_out(profile),
        "mission": {
            "id": mission.id,
            "name": mission.name,
            "phase": mission.phase,
            "destination": mission.destination,
            "gravity_g": mission.gravity_g,
            "comm_delay_seconds": mission.comm_delay_seconds,
        },
        "latest": snapshot_out(latest),
        "series": [snapshot_out(s) for s in snapshots[-200:]],
        "baselines": ctx["baselines"],
        "reference_ranges": REFERENCE_RANGES,
        "observations": observations,
        "assessments": [
            {
                "id": a.id,
                "kind": a.kind,
                "answers": a.answers,
                "scores": a.scores,
                "notes": a.notes,
                "is_private": a.is_private,
                "created_at": a.created_at.isoformat(),
            }
            for a in assessments
        ],
        "insights": [insight_out(i) for i in insights],
        "risks": [risk_out(r) for r in risks],
        "recommendations": [recommendation_out(r) for r in recommendations],
        "statistics": {
            "heart_rate": analytics.describe_series(snapshots, "heart_rate"),
            "sleep_hours": analytics.describe_series(snapshots, "sleep_hours"),
            "spo2": analytics.describe_series(snapshots, "spo2"),
            "recovery_score": analytics.describe_series(snapshots, "recovery_score"),
            "anomaly": analytics.detect_anomalies(snapshots),
            "correlations": analytics.correlations(snapshots),
        },
        "privacy": {
            "mood_detail_shared_with_viewer": mood_shared or user.role == "astronaut",
            "policy": "Private journals and AI conversations are never returned through this endpoint.",
        },
        "data_labels": {
            "telemetry": "simulated",
            "observations": "derived_model unless marked otherwise",
            "insights": "derived / predicted — not diagnoses",
        },
    }


@router.get("/{astronaut_id}/timeline")
def timeline(
    astronaut_id: int,
    mission_id: int | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.get(AstronautProfile, astronaut_id)
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Astronaut not found")
    mission = _resolve_mission(user, profile, db, mission_id)
    events: list[dict] = []
    for a in db.scalars(
        select(Assessment).where(
            Assessment.astronaut_id == profile.id, Assessment.mission_id == mission.id
        )
    ).all():
        events.append(
            {
                "type": "assessment",
                "at": a.created_at.isoformat(),
                "title": f"{a.kind.replace('_', ' ').title()} assessment logged",
                "detail": a.notes[:160],
            }
        )
    for i in db.scalars(
        select(AIInsight).where(AIInsight.astronaut_id == profile.id, AIInsight.mission_id == mission.id)
    ).all():
        events.append(
            {
                "type": "insight",
                "at": i.created_at.isoformat(),
                "title": i.title,
                "detail": f"{i.severity} · {i.data_class}",
            }
        )
    events.sort(key=lambda e: e["at"], reverse=True)
    return {
        "astronaut_id": profile.id,
        "mission": {"id": mission.id, "name": mission.name, "phase": mission.phase},
        "events": events[:120],
    }


@router.post("/{astronaut_id}/baselines", status_code=201)
def add_baseline(
    astronaut_id: int,
    payload: BaselineIn,
    request: Request,
    user: User = Depends(require_roles("medical", "admin")),
    db: Session = Depends(get_db),
):
    profile = db.get(AstronautProfile, astronaut_id)
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Astronaut not found")
    if user.role == "medical":
        ensure_astronaut_access(user, profile, db)
    db.add(
        HealthBaseline(
            astronaut_id=profile.id,
            metric=payload.metric,
            value=payload.value,
            unit=payload.unit,
            method=payload.method,
            note=payload.note,
        )
    )
    db.commit()
    audit(db, user, "baseline.create", "astronaut", profile.id, payload.metric, request)
    return {"ok": True}


def score_assessment(payload: AssessmentIn) -> dict:
    a = payload.answers or {}
    scores: dict = {}

    def num(key: str) -> float | None:
        v = a.get(key)
        try:
            return float(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    mood = num("mood")
    stress = num("stress")
    sleep_quality = num("sleep_quality")
    isolation = num("isolation")
    concentration = num("concentration")
    fatigue = num("fatigue")
    if mood is not None:
        scores["mood"] = mood
    if stress is not None:
        scores["stress"] = stress
    if isolation is not None:
        scores["isolation"] = isolation
    if concentration is not None:
        scores["concentration"] = concentration
    if fatigue is not None:
        scores["fatigue"] = fatigue
    if sleep_quality is not None:
        scores["sleep_quality"] = sleep_quality
    # Explicit safety flag: never inferred silently from other answers.
    scores["safety_flag"] = bool(a.get("safety_concern"))
    wellness = [v for v in (mood, concentration, (10 - stress if stress is not None else None)) if v is not None]
    if wellness:
        scores["wellbeing_index"] = round(sum(wellness) / len(wellness) * 10, 1)
    return scores


@router.post("/{astronaut_id}/assessments", status_code=201)
def create_assessment(
    astronaut_id: int,
    payload: AssessmentIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.get(AstronautProfile, astronaut_id)
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Astronaut not found")

    if user.role == "astronaut":
        if profile.user_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You may only submit your own assessment")
    elif user.role not in ("medical", "mission_control"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permission")
    else:
        ensure_astronaut_access(user, profile, db)

    mission = _resolve_mission(user, profile, db, None)
    if payload.client_uuid:
        existing = db.scalar(
            select(Assessment).where(
                Assessment.astronaut_id == profile.id, Assessment.client_uuid == payload.client_uuid
            )
        )
        if existing:
            return {"ok": True, "id": existing.id, "deduplicated": True}

    assessment = Assessment(
        astronaut_id=profile.id,
        mission_id=mission.id,
        kind=payload.kind,
        answers=payload.answers,
        scores=score_assessment(payload),
        notes=payload.notes,
        is_private=payload.is_private,
        client_uuid=payload.client_uuid,
    )
    db.add(assessment)
    db.commit()
    audit(db, user, "assessment.create", "astronaut", profile.id, payload.kind, request)

    result = intelligence.refresh_intelligence(db, profile, mission, create_incidents=True)
    return {
        "ok": True,
        "id": assessment.id,
        "scores": assessment.scores,
        "alerts_raised": [
            {"severity": s["severity"], "title": s["title"], "protocol": s["protocol"]}
            for s in result["signals"]
            if s["severity"] in ("high", "critical")
        ],
    }


@router.get("/{astronaut_id}/assessments")
def list_assessments(
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
            select(Assessment)
            .where(Assessment.astronaut_id == profile.id)
            .order_by(Assessment.created_at.desc())
            .limit(100)
        ).all()
    )
    if user.role != "astronaut":
        pref = profile.user.privacy
        if not (pref and pref.share_mood_summary):
            rows = [r for r in rows if r.kind == "physical"]
    return {
        "assessments": [
            {
                "id": r.id,
                "kind": r.kind,
                "answers": r.answers,
                "scores": r.scores,
                "notes": r.notes if (user.role == "astronaut") else "",
                "is_private": r.is_private,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ]
    }
