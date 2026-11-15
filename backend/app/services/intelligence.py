"""Persistence service tying the rule engine, analytics and recommendations together."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .. import analytics, rules, simulation
from ..models import (
    AIInsight,
    Assessment,
    AstronautProfile,
    HealthBaseline,
    HealthObservation,
    Incident,
    IncidentEvent,
    Mission,
    MissionAssignment,
    Notification,
    RadiationRecord,
    Recommendation,
    RiskAssessment,
    TelemetrySnapshot,
)

RECOMMENDATION_TEMPLATES = {
    "sleep": {
        "category": "sleep",
        "title": "Protect a 7.5–8 h sleep opportunity",
        "detail": "Keep a consistent sleep window, dim cabin lighting 60 minutes before bed, and use a short wind-down routine. Log the result in your next assessment.",
        "rationale": "Sleep restriction is a modifiable driver of fatigue, HRV suppression and performance loss.",
        "priority": "routine",
    },
    "cardiovascular": {
        "category": "cardiovascular",
        "title": "Complete a graded cardiovascular check",
        "detail": "Rest seated for 5 minutes, record blood pressure, then stand slowly and record again. Note any dizziness and share the result with medical personnel.",
        "rationale": "Orthostatic symptoms after fluid shifts are common; a simple seated-to-standing check adds context.",
        "priority": "priority",
    },
    "bone": {
        "category": "exercise",
        "title": "Maintain resistive exercise compliance",
        "detail": "Complete the prescribed resistive session and record load. Prioritise lower-body and axial loading where hardware allows.",
        "rationale": "Mechanical loading is the primary in-flight countermeasure to bone loss.",
        "priority": "priority",
    },
    "muscle": {
        "category": "exercise",
        "title": "Add a short strength maintenance block",
        "detail": "20 minutes of the prescribed strength protocol, keeping perceived exertion moderate. Log completion and any joint discomfort.",
        "rationale": "Muscle protein synthesis responds to regular loading; consistency beats occasional high load.",
        "priority": "routine",
    },
    "mental": {
        "category": "mental_wellbeing",
        "title": "Schedule a private wellbeing check-in",
        "detail": "Try 5 minutes of paced breathing (4 s in, 6 s out) and a short conversation with someone you trust. Optional clinician check-in available.",
        "rationale": "Early, low-stigma support reduces escalation risk during confinement.",
        "priority": "routine",
    },
    "radiation": {
        "category": "radiation",
        "title": "Review radiation countermeasures with the flight surgeon",
        "detail": "Confirm shelter location and procedure, and review the modelled cumulative dose trajectory for this mission profile.",
        "rationale": "Cumulative exposure is a mission-design constraint that benefits from early review, not acute self-management.",
        "priority": "priority",
    },
    "recovery": {
        "category": "recovery",
        "title": "Insert a lighter recovery day",
        "detail": "Reduce exercise intensity for 24 hours, prioritise hydration and sleep, then reassess HRV and fatigue.",
        "rationale": "A suppressed HRV signal often responds to a short reduction in training load.",
        "priority": "routine",
    },
    "respiratory": {
        "category": "clinical",
        "title": "Repeat the respiratory measurement and notify medical personnel",
        "detail": "Verify sensor placement, repeat SpO2 and respiratory rate at rest, and contact the crew medical officer with the result.",
        "rationale": "Respiratory deviations can indicate environment or physiological problems that need clinical review.",
        "priority": "priority",
    },
    "immune": {
        "category": "clinical",
        "title": "Follow the mission illness protocol",
        "detail": "Record temperature every 4 hours, isolate where feasible, and contact medical personnel for evaluation.",
        "rationale": "Fever in a closed habitat needs clinical assessment; this application does not diagnose infection.",
        "priority": "priority",
    },
}


def _domain_map(domain: str) -> str:
    return {
        "mental_health": "mental",
        "multivariate": "recovery",
        "mission_context": "recovery",
        "data_quality": "recovery",
    }.get(domain, domain)


def latest_context(db: Session, astronaut: AstronautProfile, mission: Mission) -> dict:
    snapshots = simulation.snapshot_history(db, astronaut.id, mission.id, limit=700)
    baselines = {
        b.metric: b.value
        for b in db.scalars(select(HealthBaseline).where(HealthBaseline.astronaut_id == astronaut.id)).all()
    }
    observations = list(
        db.scalars(
            select(HealthObservation)
            .where(
                HealthObservation.astronaut_id == astronaut.id,
                HealthObservation.mission_id == mission.id,
            )
            .order_by(HealthObservation.recorded_at)
        ).all()
    )
    radiation = list(
        db.scalars(
            select(RadiationRecord)
            .where(RadiationRecord.astronaut_id == astronaut.id, RadiationRecord.mission_id == mission.id)
            .order_by(RadiationRecord.recorded_at)
        ).all()
    )
    assessments = list(
        db.scalars(
            select(Assessment)
            .where(Assessment.astronaut_id == astronaut.id, Assessment.mission_id == mission.id)
            .order_by(Assessment.created_at)
            .limit(200)
        ).all()
    )
    return {
        "snapshots": snapshots,
        "baselines": baselines,
        "observations": observations,
        "radiation": radiation,
        "assessments": assessments,
    }


def refresh_intelligence(
    db: Session,
    astronaut: AstronautProfile,
    mission: Mission,
    *,
    create_incidents: bool = False,
) -> dict:
    """Recompute deterministic signals, statistical insights and risk indicators."""
    ctx = latest_context(db, astronaut, mission)
    snapshots = ctx["snapshots"]
    latest = snapshots[-1] if snapshots else None

    signals = rules.evaluate_snapshot(latest, mission)
    signals += rules.evaluate_context(
        mission=mission,
        snapshots=snapshots,
        baselines=ctx["baselines"],
        observations=ctx["observations"],
        radiation_daily=ctx["radiation"],
        assessments=ctx["assessments"],
    )
    signals = rules.rank_signals(signals)

    # Rebuild derived insight set for this astronaut/mission.
    db.execute(
        delete(AIInsight).where(
            AIInsight.astronaut_id == astronaut.id,
            AIInsight.mission_id == mission.id,
            AIInsight.kind.in_(["rule", "trend", "prediction"]),
        )
    )
    db.execute(
        delete(RiskAssessment).where(
            RiskAssessment.astronaut_id == astronaut.id, RiskAssessment.mission_id == mission.id
        )
    )
    db.execute(
        delete(Recommendation).where(
            Recommendation.astronaut_id == astronaut.id,
            Recommendation.mission_id == mission.id,
            Recommendation.status == "active",
        )
    )

    for sig in signals:
        db.add(
            AIInsight(
                astronaut_id=astronaut.id,
                mission_id=mission.id,
                kind=sig.kind,
                domain=sig.domain,
                severity=sig.severity,
                title=sig.title,
                summary=sig.summary,
                explanation=sig.explanation,
                confidence=sig.confidence,
                data_class=sig.data_class,
            )
        )

    insights = analytics.build_insights(
        astronaut=astronaut,
        mission=mission,
        snapshots=snapshots,
        observations=ctx["observations"],
        baselines=ctx["baselines"],
        radiation_daily=ctx["radiation"],
    )
    for item in insights:
        db.add(
            AIInsight(
                astronaut_id=astronaut.id,
                mission_id=mission.id,
                title=item["title"],
                summary=item["summary"],
                confidence=item["confidence"],
                data_class=item["data_class"],
                **{
                    k: v
                    for k, v in item.items()
                    if k in ("kind", "domain", "severity", "explanation")
                },
            )
        )

    risks = analytics.risk_scores(
        mission=mission,
        snapshots=snapshots,
        baselines=ctx["baselines"],
        observations=ctx["observations"],
        radiation_daily=ctx["radiation"],
        signals=signals,
    )
    for r in risks:
        db.add(
            RiskAssessment(
                astronaut_id=astronaut.id,
                mission_id=mission.id,
                domain=r["domain"],
                score=r["score"],
                confidence=r["confidence"],
                horizon_days=r["horizon_days"],
                rationale=r["rationale"],
            )
        )

    seen: set[str] = set()
    for r in risks:
        if r["score"] < 30:
            continue
        template = RECOMMENDATION_TEMPLATES.get(r["domain"])
        if not template or template["category"] in seen:
            continue
        seen.add(template["category"])
        db.add(
            Recommendation(
                astronaut_id=astronaut.id,
                mission_id=mission.id,
                category=template["category"],
                title=template["title"],
                detail=template["detail"],
                rationale=template["rationale"],
                priority="priority" if r["score"] >= 55 else template["priority"],
            )
        )

    db.commit()

    created_incidents = []
    if create_incidents:
        created_incidents = _maybe_raise_incidents(db, astronaut, mission, signals)

    return {
        "signals": [
            {
                "domain": s.domain,
                "severity": s.severity,
                "title": s.title,
                "summary": s.summary,
                "explanation": s.explanation,
                "data_class": s.data_class,
                "protocol": s.protocol,
            }
            for s in signals
        ],
        "insights": insights,
        "risks": risks,
        "incidents_created": created_incidents,
    }


def _maybe_raise_incidents(db: Session, astronaut: AstronautProfile, mission: Mission, signals) -> list[int]:
    created: list[int] = []
    for sig in signals:
        if not sig.escalate_incident or sig.severity not in ("high", "critical"):
            continue
        existing = db.scalar(
            select(Incident).where(
                Incident.astronaut_id == astronaut.id,
                Incident.mission_id == mission.id,
                Incident.title == sig.title,
                Incident.status.in_(["new", "acknowledged", "under_review", "action_required"]),
            )
        )
        if existing:
            continue
        incident = Incident(
            mission_id=mission.id,
            astronaut_id=astronaut.id,
            source="rule_engine",
            severity="critical" if sig.severity == "critical" else "high",
            title=sig.title,
            description=sig.summary,
            status="new",
        )
        db.add(incident)
        db.flush()
        db.add(
            IncidentEvent(
                incident_id=incident.id,
                action="created",
                note="Raised automatically by the deterministic safety rule engine (no LLM involved).",
            )
        )
        protocol = rules.EMERGENCY_PROTOCOLS.get(sig.protocol or "", [])
        if protocol:
            db.add(
                IncidentEvent(
                    incident_id=incident.id,
                    action="protocol",
                    note="Immediate guidance: " + " ".join(protocol),
                )
            )
        users = [
            row
            for row in db.scalars(
                select(MissionAssignment.user_id).where(MissionAssignment.mission_id == mission.id)
            ).all()
        ]
        for uid in users:
            db.add(
                Notification(
                    user_id=uid,
                    title=f"{sig.severity.upper()}: {sig.title}",
                    body=f"{astronaut.callsign} — {sig.summary}",
                    level="critical" if sig.severity == "critical" else "warning",
                    link=f"/app/incidents/{incident.id}",
                )
            )
        created.append(incident.id)
    if created:
        db.commit()
    return created


def astronaut_context_payload(db: Session, astronaut: AstronautProfile, mission: Mission) -> dict:
    ctx = latest_context(db, astronaut, mission)
    snapshots = ctx["snapshots"]
    latest = snapshots[-1] if snapshots else None
    insights = list(
        db.scalars(
            select(AIInsight)
            .where(AIInsight.astronaut_id == astronaut.id, AIInsight.mission_id == mission.id)
            .order_by(AIInsight.created_at.desc())
            .limit(8)
        ).all()
    )
    risks = list(
        db.scalars(
            select(RiskAssessment).where(
                RiskAssessment.astronaut_id == astronaut.id, RiskAssessment.mission_id == mission.id
            )
        ).all()
    )
    sleep_vals = [s.sleep_hours for s in snapshots[-9:]]
    return {
        "astronaut": {
            "callsign": astronaut.callsign,
            "age": astronaut.age,
            "flight_hours": astronaut.flight_hours,
        },
        "mission": {
            "name": mission.name,
            "category": mission.category,
            "destination": mission.destination,
            "phase": mission.phase,
            "gravity_g": mission.gravity_g,
            "comm_delay_seconds": mission.comm_delay_seconds,
            "medical_support": mission.medical_support,
        },
        "latest_simulated_vitals": (
            {
                "heart_rate": latest.heart_rate,
                "spo2": latest.spo2,
                "systolic": latest.systolic,
                "diastolic": latest.diastolic,
                "resp_rate": latest.resp_rate,
                "sleep_hours": latest.sleep_hours,
                "recorded_at": latest.recorded_at.isoformat(),
                "source": "simulated",
            }
            if latest
            else {}
        ),
        "sleep": {
            "mean": round(sum(sleep_vals) / len(sleep_vals), 2) if sleep_vals else None,
            "samples": len(sleep_vals),
        },
        "radiation": {
            "cumulative_msv": simulation.cumulative_dose(db, astronaut.id, mission.id),
            "rate_msv_day": mission.radiation_dose_rate_msv_day,
        },
        "insights": [
            {
                "title": i.title,
                "severity": i.severity,
                "summary": i.summary,
                "data_class": i.data_class,
            }
            for i in insights
        ],
        "risk_scores": [
            {"domain": r.domain, "score": r.score, "confidence": r.confidence} for r in risks
        ],
        "baselines": ctx["baselines"],
    }


def all_open_insights(db: Session, mission_id: int) -> list[AIInsight]:
    return list(
        db.scalars(
            select(AIInsight)
            .where(AIInsight.mission_id == mission_id)
            .order_by(AIInsight.created_at.desc())
            .limit(120)
        ).all()
    )
