"""Space radiation intelligence: modelled dose, alerts and external space weather."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import simulation
from ..database import get_db
from ..models import AstronautProfile, Mission, MissionAssignment, RadiationRecord, User
from ..reference import RADIATION_ENVIRONMENTS, REFERENCE_RANGES, SAFETY_LIMITS
from ..security import ensure_astronaut_access, ensure_mission_access, get_current_user
from ..serializers import radiation_out
from ..services import spaceweather

router = APIRouter(prefix="/api/radiation", tags=["radiation"])


def _resolve(user: User, db: Session, astronaut_id: int | None, mission_id: int | None):
    if astronaut_id is not None:
        profile = db.get(AstronautProfile, astronaut_id)
        if not profile:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Astronaut not found")
        ensure_astronaut_access(user, profile, db)
        assignment = db.scalar(
            select(MissionAssignment)
            .where(MissionAssignment.user_id == profile.user_id)
            .order_by(MissionAssignment.created_at.desc())
        )
        mission = db.get(Mission, mission_id or (assignment.mission_id if assignment else 0))
        if not mission:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Mission not found")
        return profile, mission
    if mission_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "astronaut_id or mission_id required")
    ensure_mission_access(user, mission_id, db)
    mission = db.get(Mission, mission_id)
    if not mission:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mission not found")
    return None, mission


@router.get("")
def radiation(
    astronaut_id: int | None = None,
    mission_id: int | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile, mission = _resolve(user, db, astronaut_id, mission_id)
    q = select(RadiationRecord).where(RadiationRecord.mission_id == mission.id)
    if profile:
        q = q.where(RadiationRecord.astronaut_id == profile.id)
    records = list(db.scalars(q.order_by(RadiationRecord.recorded_at)).all())
    total = round(sum(r.dose_increment_msv for r in records), 2)
    daily_rate = mission.radiation_dose_rate_msv_day
    remaining = max(0, mission.planned_duration_days - mission.elapsed_duration_days)
    env = RADIATION_ENVIRONMENTS.get(
        mission.radiation_environment,
        {"label": mission.radiation_environment, "dose_rate_msv_day": daily_rate, "source": "Custom profile"},
    )
    return {
        "mission": {
            "id": mission.id,
            "name": mission.name,
            "destination": mission.destination,
            "environment": env,
            "phase": mission.phase,
        },
        "astronaut": {"id": profile.id, "callsign": profile.callsign} if profile else None,
        "cumulative_dose_msv": total,
        "rate_msv_day": daily_rate,
        "projected_end_of_mission_msv": round(total + daily_rate * remaining, 1),
        "remaining_days": remaining,
        "series": [radiation_out(r) for r in records],
        "events": [radiation_out(r) for r in records if r.event_label],
        "alerts": _alerts(total, records),
        "screening_limit": SAFETY_LIMITS,
        "data_classes": {
            "series": "modelled from mission profile (not a dosimeter measurement)",
            "space_weather": "external observation (NOAA SWPC), if available",
            "biological_risk": "estimated indicator, not a clinical assessment",
        },
        "health_context": {
            "note": "Dose values are modelled; correlation with health indicators is exploratory and not causal."
        },
        "reference": REFERENCE_RANGES["cumulative_dose"],
    }


def _alerts(total: float, records: list) -> list[dict]:
    alerts = []
    for r in records:
        if r.dose_increment_msv >= 10:
            alerts.append(
                {
                    "severity": "critical" if r.dose_increment_msv >= 20 else "high",
                    "title": "Solar particle event dose spike (modelled)",
                    "detail": f"{r.dose_increment_msv:.1f} mSv modelled on {r.recorded_at.date().isoformat()}",
                    "at": r.recorded_at.isoformat(),
                    "data_class": "modelled",
                }
            )
    if total >= 500:
        alerts.append(
            {
                "severity": "high",
                "title": "Cumulative modelled dose above 500 mSv",
                "detail": "Review with the radiation officer. Not an operational dose record.",
                "at": records[-1].recorded_at.isoformat() if records else None,
                "data_class": "modelled",
            }
        )
    elif total >= 300:
        alerts.append(
            {
                "severity": "moderate",
                "title": "Cumulative modelled dose above 300 mSv",
                "detail": "Mission-design review recommended.",
                "at": records[-1].recorded_at.isoformat() if records else None,
                "data_class": "modelled",
            }
        )
    return alerts


@router.get("/forecast")
def forecast(
    mission_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ensure_mission_access(user, mission_id, db)
    mission = db.get(Mission, mission_id)
    if not mission:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mission not found")

    from .missions import active_scenario

    sc = active_scenario(db, mission_id)
    cfg = (sc.config if sc else {}) or {}
    solar_day = cfg.get("solar_event_day")
    projected_dose = cfg.get("solar_event_dose_msv", 0.0)

    weather = spaceweather.planetary_k_index()
    return {
        "mission_id": mission_id,
        "observed_space_weather": weather,
        "event_forecast": {
            "available": solar_day is not None,
            "source": "COSMICARE simulation scenario",
            "data_class": "scenario_forecast",
            "solar_event_day": solar_day,
            "estimated_event_dose_msv": projected_dose if solar_day is not None else None,
            "note": "This is a configured simulation scenario, not a real solar-event forecast. "
            "A solar-event forecast never provides an exact astronaut dose.",
        },
        "ingestion_note": "Observed geomagnetic indices are fetched from NOAA SWPC when reachable; "
        "astronaut dose remains modelled by COSMICARE.",
    }


@router.get("/alerts")
def alerts(
    mission_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ensure_mission_access(user, mission_id, db)
    records = list(
        db.scalars(
            select(RadiationRecord)
            .where(RadiationRecord.mission_id == mission_id)
            .order_by(RadiationRecord.recorded_at)
        ).all()
    )
    total = sum(r.dose_increment_msv for r in records)
    return {
        "alerts": _alerts(total, records),
        "cumulative_dose_msv": round(total, 1),
        "data_class": "modelled",
    }
