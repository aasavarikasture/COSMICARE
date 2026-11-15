"""Deterministic telemetry simulation engine.

Every generated value is explicitly labelled ``source="simulated"``. The engine is
seeded so demonstrations are reproducible, and supports mission environment
effects (gravity, radiation, comm delay), sleep disruption, sensor faults and
solar-particle-event scenarios.

This is not a physiological model validated for operational use.
"""
from __future__ import annotations

import hashlib
import math
import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .models import (
    AstronautProfile,
    HealthBaseline,
    HealthObservation,
    Mission,
    MissionAssignment,
    RadiationRecord,
    TelemetrySnapshot,
)
from .reference import RADIATION_ENVIRONMENTS

DEFAULT_BASELINES = {
    "heart_rate": (62.0, "bpm", "clinical_assessment"),
    "hrv": (52.0, "ms", "clinical_assessment"),
    "systolic": (116.0, "mmHg", "clinical_assessment"),
    "diastolic": (74.0, "mmHg", "clinical_assessment"),
    "spo2": (98.0, "%", "clinical_assessment"),
    "resp_rate": (14.0, "breaths/min", "clinical_assessment"),
    "body_temp": (36.7, "°C", "clinical_assessment"),
    "sleep_hours": (7.6, "h", "self_report"),
    "bone_density": (1.18, "g/cm²", "derived_model"),
    "grip_strength": (44.0, "kg", "clinical_assessment"),
}

DAY_SECONDS = 86400


def _stable_seed(*parts: object) -> int:
    raw = "|".join(str(p) for p in parts).encode("utf-8")
    return int.from_bytes(hashlib.sha256(raw).digest()[:8], "big") % (2**31 - 1)


def ensure_baselines(db: Session, astronaut: AstronautProfile, seed: int = 2026) -> dict[str, float]:
    """Create individual pre-flight baselines once, then return metric -> value."""
    existing = {
        b.metric: b.value
        for b in db.scalars(select(HealthBaseline).where(HealthBaseline.astronaut_id == astronaut.id)).all()
    }
    created = False
    for metric, (value, unit, method) in DEFAULT_BASELINES.items():
        if metric in existing:
            continue
        rng = random.Random(_stable_seed(seed, astronaut.id, metric))
        jitter = rng.uniform(-1, 1)
        adjusted = value
        if metric == "heart_rate":
            adjusted = value + jitter * 6
        elif metric == "hrv":
            adjusted = value + jitter * 12
        elif metric in ("systolic", "diastolic"):
            adjusted = value + jitter * 7
        elif metric == "sleep_hours":
            adjusted = value + jitter * 0.7
        elif metric == "bone_density":
            adjusted = value + jitter * 0.08
        elif metric == "grip_strength":
            adjusted = value + jitter * 7
        db.add(
            HealthBaseline(
                astronaut_id=astronaut.id,
                metric=metric,
                value=round(adjusted, 2),
                unit=unit,
                method=method,
                note="Pre-flight individual baseline (seeded demo value).",
            )
        )
        existing[metric] = round(adjusted, 2)
        created = True
    if created:
        db.commit()
    return existing


def _grav_effects(mission: Mission, day: float) -> dict[str, float]:
    """Progressive adaptation to reduced gravity, saturating with exposure."""
    g = mission.gravity_g
    exposure = min(1.0, day / 30.0)
    unloading = max(0.0, 1.0 - g) if g < 1 else 0.0
    exercise_mitigation = 0.55 if mission.exercise_available else 1.0
    return {
        "hr": 5.5 * unloading * min(1.0, day / 20.0),
        "hrv": -9.0 * unloading * min(1.0, day / 25.0),
        "bp": -4.0 * unloading * min(1.0, day / 15.0),
        "bone_pct_month": -1.15 * unloading * exercise_mitigation * exposure,
        "muscle_pct_month": -1.4 * unloading * exercise_mitigation * exposure,
        "sleep_penalty": 0.35 * unloading * min(1.0, day / 45.0),
    }


def _scenario_bias(config: dict, day: float) -> dict[str, float]:
    stress = float(config.get("stress", 0.0))
    sleep_penalty = float(config.get("sleep_penalty", 0.0))
    anomaly_bias = float(config.get("anomaly_bias", 0.0))
    return {
        "stress": stress,
        "sleep_penalty": sleep_penalty,
        "anomaly_bias": anomaly_bias,
        "on": True,
    }


def _solar_event(config: dict, day: float) -> str:
    event_day = config.get("solar_event_day")
    if event_day is None:
        return ""
    if abs(day - float(event_day)) <= 0.75:
        return str(config.get("solar_event_label", "Solar particle event (simulated)"))
    return ""


def generate_snapshot(
    *,
    astronaut: AstronautProfile,
    baselines: dict[str, float],
    mission: Mission,
    day: float,
    slot: int,
    seed: int,
    config: dict,
    recorded_at: datetime,
) -> TelemetrySnapshot:
    """Build one deterministic simulated sample for a mission day/slot."""
    rng = random.Random(_stable_seed(seed, astronaut.id, mission.id, round(day, 3), slot))
    effects = _grav_effects(mission, day)
    bias = _scenario_bias(config, day)
    noise_ppm = float(mission.environment.get("noise_db", 60))

    hour = (6 + slot * 6) % 24
    diurnal_hr = 6.0 if 6 <= hour < 12 else (3.0 if 12 <= hour < 20 else -4.0)
    sleep_hours = baselines.get("sleep_hours", 7.5) - effects["sleep_penalty"] - bias["sleep_penalty"]
    sleep_hours -= max(0.0, (noise_ppm - 55) / 90.0)
    sleep_hours += rng.gauss(0, 0.45)
    # Long-duration sleep degradation, partially offset by exercise in the day cycle.
    sleep_hours -= min(0.9, day / 220.0) * (0.6 if mission.comm_delay_seconds > 300 else 0.35)
    sleep_hours = max(3.4, min(9.6, sleep_hours))

    sleep_quality = 88 - 4.2 * max(0.0, 7.5 - sleep_hours) - bias["stress"] * 10 + rng.gauss(0, 4)
    sleep_quality = max(25.0, min(99.0, sleep_quality))

    exercise = 0.0
    if mission.exercise_available:
        exercise = {0: 32, 1: 55, 2: 28}.get(slot, 30) + rng.gauss(0, 8)
        exercise = max(0.0, exercise)
    steps = int(max(1200, rng.gauss(6200, 1400) + exercise * 60 - bias["stress"] * 900))

    hr = (
        baselines.get("heart_rate", 62)
        + diurnal_hr
        + effects["hr"]
        + 18 * math.exp(-((hour - 7) ** 2) / 2.2) * (1 if sleep_hours > 6 else 1.4)
        + bias["stress"] * 7
        + max(0.0, 7.2 - sleep_hours) * 2.4
        + rng.gauss(0, 3.2)
    )
    hrv = (
        baselines.get("hrv", 52)
        + effects["hrv"]
        - bias["stress"] * 9
        - max(0.0, 7.2 - sleep_hours) * 3.1
        + rng.gauss(0, 4.5)
    )
    systolic = baselines.get("systolic", 116) + effects["bp"] + bias["stress"] * 5 + rng.gauss(0, 4.0)
    diastolic = baselines.get("diastolic", 74) + effects["bp"] * 0.6 + bias["stress"] * 3 + rng.gauss(0, 2.8)
    spo2 = 98.0 + rng.gauss(0, 0.7) - (0.6 if mission.environment.get("cabin_pressure_kpa", 101) < 70 else 0.0)
    resp = baselines.get("resp_rate", 14) + bias["stress"] * 1.6 + rng.gauss(0, 1.0)
    temp = baselines.get("body_temp", 36.7) + rng.gauss(0, 0.16)

    anomaly = bias["anomaly_bias"]
    if anomaly > 0:
        hr += anomaly * 9
        spo2 -= anomaly * 2.2
        systolic += anomaly * 6
        hrv -= anomaly * 8

    recovery = 72 - bias["stress"] * 14 - max(0.0, 7.5 - sleep_hours) * 6 + min(10.0, exercise / 12) + rng.gauss(0, 5)

    sensor_status = "nominal"
    if config.get("sensor_fault") and rng.random() < 0.18:
        sensor_status = "intermittent"
        if rng.random() < 0.5:
            hr = 0.0
            spo2 = 0.0

    return TelemetrySnapshot(
        astronaut_id=astronaut.id,
        mission_id=mission.id,
        recorded_at=recorded_at,
        heart_rate=round(max(0.0, hr), 1),
        hrv=round(max(0.0, hrv), 1),
        systolic=round(systolic, 1),
        diastolic=round(diastolic, 1),
        spo2=round(min(100.0, max(0.0, spo2)), 1),
        resp_rate=round(max(0.0, resp), 1),
        body_temp=round(min(40.0, max(34.0, temp)), 2),
        steps=steps,
        sleep_hours=round(sleep_hours, 2),
        sleep_quality=round(sleep_quality, 1),
        exercise_minutes=round(exercise, 1),
        recovery_score=round(max(15.0, min(100.0, recovery)), 1),
        source="simulated",
        scenario_id=str(config.get("scenario_id", "baseline")),
        sensor_status=sensor_status,
    )


def crew_for_mission(db: Session, mission: Mission) -> list[AstronautProfile]:
    profiles = db.scalars(
        select(AstronautProfile)
        .join(MissionAssignment, MissionAssignment.user_id == AstronautProfile.user_id)
        .where(MissionAssignment.mission_id == mission.id)
        .order_by(AstronautProfile.id)
    ).all()
    return list(profiles)


def regenerate_mission(
    db: Session,
    mission: Mission,
    *,
    seed: int,
    config: dict,
    days: int | None = None,
    now: datetime | None = None,
) -> dict:
    """Rebuild the simulated history for a mission (idempotent, deterministic)."""
    now = now or datetime.now(timezone.utc)
    elapsed = days if days is not None else max(1, mission.elapsed_duration_days)
    elapsed = min(elapsed, 900)
    crew = crew_for_mission(db, mission)
    db.execute(delete(TelemetrySnapshot).where(TelemetrySnapshot.mission_id == mission.id))
    db.execute(delete(HealthObservation).where(HealthObservation.mission_id == mission.id))
    db.execute(delete(RadiationRecord).where(RadiationRecord.mission_id == mission.id))
    db.commit()

    rate = mission.radiation_dose_rate_msv_day
    for astronaut in crew:
        baselines = ensure_baselines(db, astronaut, seed)
        for d in range(elapsed, -1, -1):
            day = elapsed - d
            day_time = now - timedelta(days=d)
            slots = range(0, 4) if d <= 2 else range(1, 3) if d <= 7 else range(1, 2)
            for slot in slots:
                ts = day_time.replace(hour=(6 + slot * 6) % 24, minute=15, second=0, microsecond=0)
                db.add(
                    generate_snapshot(
                        astronaut=astronaut,
                        baselines=baselines,
                        mission=mission,
                        day=day,
                        slot=slot,
                        seed=seed,
                        config=config,
                        recorded_at=ts,
                    )
                )

            # Weekly derived bone / muscle observations.
            if day == 0 or day % 7 == 0:
                grav = _grav_effects(mission, day)
                bone = baselines.get("bone_density", 1.18) * (
                    1 + grav["bone_pct_month"] * (day / 30.0) / 100.0
                )
                grip = baselines.get("grip_strength", 44) * (
                    1 + grav["muscle_pct_month"] * (day / 30.0) / 100.0
                )
                db.add(
                    HealthObservation(
                        astronaut_id=astronaut.id,
                        mission_id=mission.id,
                        metric="bone_density",
                        value=round(bone, 3),
                        unit="g/cm²",
                        method="derived_model",
                        source_ref="COSMICARE microgravity unloading model (illustrative, not DXA)",
                        recorded_at=day_time,
                    )
                )
                db.add(
                    HealthObservation(
                        astronaut_id=astronaut.id,
                        mission_id=mission.id,
                        metric="grip_strength",
                        value=round(grip, 1),
                        unit="kg",
                        method="simulated_assessment",
                        source_ref="COSMICARE strength model (illustrative)",
                        recorded_at=day_time,
                    )
                )

            # Daily modelled dose accumulation, with optional SPE spike.
            event = _solar_event(config, day)
            spike = 0.0
            if event:
                spike = float(config.get("solar_event_dose_msv", 12.0))
            dose = max(0.0, rate + (spike if event else 0.0))
            db.add(
                RadiationRecord(
                    astronaut_id=astronaut.id,
                    mission_id=mission.id,
                    recorded_at=day_time,
                    dose_increment_msv=round(dose, 3),
                    dose_rate_msv_day=round(rate, 3),
                    source_type="modelled",
                    event_label=event,
                )
            )
    db.commit()
    return {"mission_id": mission.id, "crew": len(crew), "days": elapsed, "samples": elapsed * len(crew)}


def append_latest(db: Session, mission: Mission, seed: int, config: dict, now: datetime | None = None) -> list[TelemetrySnapshot]:
    """Append one fresh sample per crew member (used by demo 'advance' action)."""
    now = now or datetime.now(timezone.utc)
    day = float(mission.elapsed_duration_days)
    created = []
    for astronaut in crew_for_mission(db, mission):
        baselines = ensure_baselines(db, astronaut, seed)
        slot = now.hour // 6
        snap = generate_snapshot(
            astronaut=astronaut,
            baselines=baselines,
            mission=mission,
            day=day,
            slot=slot,
            seed=seed,
            config=config,
            recorded_at=now,
        )
        db.add(snap)
        created.append(snap)
    db.commit()
    return created


def latest_snapshot(db: Session, astronaut_id: int) -> TelemetrySnapshot | None:
    return db.scalar(
        select(TelemetrySnapshot)
        .where(TelemetrySnapshot.astronaut_id == astronaut_id)
        .order_by(TelemetrySnapshot.recorded_at.desc())
        .limit(1)
    )


def snapshot_history(db: Session, astronaut_id: int, mission_id: int | None = None, limit: int = 500) -> list[TelemetrySnapshot]:
    q = select(TelemetrySnapshot).where(TelemetrySnapshot.astronaut_id == astronaut_id)
    if mission_id:
        q = q.where(TelemetrySnapshot.mission_id == mission_id)
    return list(db.scalars(q.order_by(TelemetrySnapshot.recorded_at.desc()).limit(limit)).all())[::-1]


def cumulative_dose(db: Session, astronaut_id: int, mission_id: int | None = None) -> float:
    q = select(RadiationRecord).where(RadiationRecord.astronaut_id == astronaut_id)
    if mission_id:
        q = q.where(RadiationRecord.mission_id == mission_id)
    return round(sum(r.dose_increment_msv for r in db.scalars(q).all()), 2)


def radiation_environment_label(value: str) -> dict:
    return RADIATION_ENVIRONMENTS.get(value, {"label": value, "dose_rate_msv_day": 0.4, "source": "Custom"})
