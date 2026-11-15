"""Response shaping helpers. Keeps API payloads explicit and consistent."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import (
    AIInsight,
    AstronautProfile,
    Incident,
    Mission,
    MissionAssignment,
    Notification,
    RadiationRecord,
    Recommendation,
    RiskAssessment,
    TelemetrySnapshot,
    User,
)


def iso(dt) -> str | None:
    return dt.isoformat() if dt else None


def user_out(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "is_active": user.is_active,
        "created_at": iso(user.created_at),
        "last_login_at": iso(user.last_login_at),
    }


def astronaut_out(profile: AstronautProfile, db: Session | None = None) -> dict:
    data = {
        "id": profile.id,
        "user_id": profile.user_id,
        "name": profile.user.full_name if profile.user else "",
        "email": profile.user.email if profile.user else "",
        "callsign": profile.callsign,
        "age": profile.age,
        "sex": profile.sex,
        "height_cm": profile.height_cm,
        "weight_kg": profile.weight_kg,
        "agency": profile.agency,
        "flight_hours": profile.flight_hours,
        "health_history": profile.health_history,
        "risk_flags": profile.risk_flags or [],
        "readiness": profile.readiness or {},
    }
    if db is not None:
        mission_ids = db.scalars(
            select(MissionAssignment.mission_id).where(MissionAssignment.user_id == profile.user_id)
        ).all()
        missions = db.scalars(select(Mission).where(Mission.id.in_(mission_ids))).all() if mission_ids else []
        data["missions"] = [
            {"id": m.id, "name": m.name, "phase": m.phase, "code": m.code} for m in missions
        ]
    return data


def mission_out(mission: Mission, db: Session | None = None) -> dict:
    data = {
        "id": mission.id,
        "code": mission.code,
        "name": mission.name,
        "category": mission.category,
        "destination": mission.destination,
        "planned_duration_days": mission.planned_duration_days,
        "elapsed_duration_days": mission.elapsed_duration_days,
        "phase": mission.phase,
        "status": mission.status,
        "crew_size": mission.crew_size,
        "gravity_g": mission.gravity_g,
        "radiation_environment": mission.radiation_environment,
        "radiation_dose_rate_msv_day": mission.radiation_dose_rate_msv_day,
        "comm_delay_seconds": mission.comm_delay_seconds,
        "exercise_available": mission.exercise_available,
        "medical_support": mission.medical_support,
        "environment": mission.environment or {},
        "monitoring_profile": mission.monitoring_profile or {},
        "description": mission.description,
        "created_at": iso(mission.created_at),
    }
    if db is not None:
        crew = db.execute(
            select(AstronautProfile, MissionAssignment)
            .join(MissionAssignment, MissionAssignment.user_id == AstronautProfile.user_id)
            .where(MissionAssignment.mission_id == mission.id)
        ).all()
        data["crew"] = [
            {
                "astronaut_id": a.id,
                "user_id": a.user_id,
                "name": a.user.full_name,
                "callsign": a.callsign,
                "seat": assignment.seat,
                "role_on_mission": assignment.role_on_mission,
            }
            for a, assignment in crew
        ]
        data["open_incidents"] = db.scalar(
            select(func.count(Incident.id)).where(
                Incident.mission_id == mission.id,
                Incident.status.in_(["new", "acknowledged", "under_review", "action_required"]),
            )
        )
    return data


def snapshot_out(s: TelemetrySnapshot | None) -> dict | None:
    if not s:
        return None
    return {
        "id": s.id,
        "astronaut_id": s.astronaut_id,
        "mission_id": s.mission_id,
        "recorded_at": iso(s.recorded_at),
        "heart_rate": s.heart_rate,
        "hrv": s.hrv,
        "systolic": s.systolic,
        "diastolic": s.diastolic,
        "spo2": s.spo2,
        "resp_rate": s.resp_rate,
        "body_temp": s.body_temp,
        "steps": s.steps,
        "sleep_hours": s.sleep_hours,
        "sleep_quality": s.sleep_quality,
        "exercise_minutes": s.exercise_minutes,
        "recovery_score": s.recovery_score,
        "source": s.source,
        "sensor_status": s.sensor_status,
        "simulated": s.source == "simulated",
    }


def insight_out(i: AIInsight) -> dict:
    return {
        "id": i.id,
        "astronaut_id": i.astronaut_id,
        "mission_id": i.mission_id,
        "kind": i.kind,
        "domain": i.domain,
        "severity": i.severity,
        "title": i.title,
        "summary": i.summary,
        "explanation": i.explanation,
        "confidence": i.confidence,
        "data_class": i.data_class,
        "status": i.status,
        "created_at": iso(i.created_at),
    }


def risk_out(r: RiskAssessment) -> dict:
    return {
        "id": r.id,
        "domain": r.domain,
        "score": r.score,
        "confidence": r.confidence,
        "horizon_days": r.horizon_days,
        "rationale": r.rationale,
        "created_at": iso(r.created_at),
    }


def recommendation_out(r: Recommendation) -> dict:
    return {
        "id": r.id,
        "astronaut_id": r.astronaut_id,
        "mission_id": r.mission_id,
        "category": r.category,
        "title": r.title,
        "detail": r.detail,
        "rationale": r.rationale,
        "priority": r.priority,
        "status": r.status,
        "adherence": r.adherence,
        "created_at": iso(r.created_at),
    }


def radiation_out(r: RadiationRecord) -> dict:
    return {
        "id": r.id,
        "recorded_at": iso(r.recorded_at),
        "dose_increment_msv": r.dose_increment_msv,
        "dose_rate_msv_day": r.dose_rate_msv_day,
        "source_type": r.source_type,
        "event_label": r.event_label,
    }


def incident_out(i: Incident, db: Session | None = None) -> dict:
    data = {
        "id": i.id,
        "mission_id": i.mission_id,
        "astronaut_id": i.astronaut_id,
        "source": i.source,
        "severity": i.severity,
        "title": i.title,
        "description": i.description,
        "status": i.status,
        "assigned_to": i.assigned_to,
        "acknowledged_at": iso(i.acknowledged_at),
        "resolved_at": iso(i.resolved_at),
        "resolution_summary": i.resolution_summary,
        "created_at": iso(i.created_at),
    }
    if db is not None:
        data["events"] = [
            {
                "id": e.id,
                "action": e.action,
                "note": e.note,
                "actor_id": e.actor_id,
                "created_at": iso(e.created_at),
            }
            for e in i.events
        ]
        responder = db.get(User, i.assigned_to) if i.assigned_to else None
        data["assigned_to_name"] = responder.full_name if responder else None
    return data


def notification_out(n: Notification) -> dict:
    return {
        "id": n.id,
        "title": n.title,
        "body": n.body,
        "level": n.level,
        "link": n.link,
        "read": n.read_at is not None,
        "created_at": iso(n.created_at),
    }
