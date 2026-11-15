"""Deterministic demo data.

Every physiological value created here is simulated. The seed is reproducible so
judges can reset to a known state. Credentials are demonstration-only.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import simulation
from .database import Base, SessionLocal, engine
from .models import (
    AIInsight,
    Assessment,
    AstronautProfile,
    HealthObservation,
    Incident,
    IncidentEvent,
    Intervention,
    MedicalProfile,
    Message,
    Mission,
    MissionAssignment,
    Notification,
    PrivacyPreference,
    TelemetryScenario,
    TelemetrySnapshot,
    User,
)
from .reference import MISSION_PRESETS
from .security import hash_password
from .services import intelligence

DEMO_PASSWORD = "Cosmicare!2026"
DEMO_ACCOUNTS = [
    {"role": "astronaut", "name": "Amara Reyes", "email": "reyes@cosmicare.demo", "password": DEMO_PASSWORD},
    {"role": "medical", "name": "Dr. Imani Hale", "email": "hale@cosmicare.demo", "password": DEMO_PASSWORD},
    {"role": "mission_control", "name": "Alex Chen", "email": "control@cosmicare.demo", "password": DEMO_PASSWORD},
    {"role": "admin", "name": "System Administrator", "email": "admin@cosmicare.demo", "password": DEMO_PASSWORD},
]

ASTRONAUTS = [
    ("Amara Reyes", "REYES", 38, "female", 172, 63, 420),
    ("Tomás Lima", "LIMA", 41, "male", 179, 76, 260),
    ("Ji-woo Park", "PARK", 36, "female", 165, 58, 180),
    ("Nnamdi Okafor", "OKAFOR", 44, "male", 183, 81, 640),
    ("Elena Voss", "VOSS", 39, "female", 170, 61, 320),
    ("Kwame Adeyemi", "ADEYEMI", 34, "male", 176, 73, 95),
    ("Ingrid Solberg", "SOLBERG", 47, "female", 168, 64, 910),
    ("Hana Nakamura", "NAKAMURA", 32, "female", 161, 54, 60),
    ("Malik Diallo", "DIALLO", 37, "male", 181, 78, 140),
    ("Noor Mercer", "MERCER", 30, "female", 167, 60, 0),
]

MISSIONS = [
    {
        "preset": 1,
        "elapsed": 120,
        "phase": "in_flight",
        "crew": ["REYES", "LIMA", "PARK", "OKAFOR"],
        "scenario": {"scenario_id": "iss-baseline", "stress": 0.15, "sleep_penalty": 0.2},
    },
    {
        "preset": 3,
        "elapsed": 210,
        "phase": "in_flight",
        "crew": ["VOSS", "ADEYEMI", "SOLBERG"],
        "scenario": {
            "scenario_id": "mars-spe",
            "stress": 0.35,
            "sleep_penalty": 0.6,
            "solar_event_day": 150,
            "solar_event_dose_msv": 18.0,
            "solar_event_label": "Solar particle event — simulated (day 150)",
        },
    },
    {
        "preset": 0,
        "elapsed": 5,
        "phase": "in_flight",
        "crew": ["NAKAMURA", "DIALLO"],
        "scenario": {"scenario_id": "artemis-baseline", "stress": 0.1},
    },
]


def _create_user(
    db: Session,
    *,
    name: str,
    email: str,
    role: str,
    password: str = DEMO_PASSWORD,
    callsign: str | None = None,
    age: int = 35,
    sex: str = "unspecified",
    height: float = 174.0,
    weight: float = 70.0,
    flight_hours: int = 0,
) -> User:
    user = User(
        email=email,
        password_hash=hash_password(password),
        full_name=name,
        role=role,
    )
    db.add(user)
    db.flush()
    db.add(PrivacyPreference(user_id=user.id, share_mood_summary=False))
    if role == "astronaut":
        db.add(
            AstronautProfile(
                user_id=user.id,
                callsign=callsign or name.split()[0].upper()[:24],
                age=age,
                sex=sex,
                height_cm=height,
                weight_kg=weight,
                agency="COSMICARE Demo Crew",
                flight_hours=flight_hours,
                health_history="No disclosed condition. Demo record.",
                risk_flags=[],
                readiness={
                    "physical": 78 + (len(name) % 15),
                    "mental": 80 + (len(name) % 12),
                    "sleep": 74 + (len(name) % 18),
                    "assessed_on": (datetime.now(timezone.utc) - timedelta(days=30)).date().isoformat(),
                    "note": "Pre-flight readiness screening (demo values).",
                },
            )
        )
    elif role == "medical":
        db.add(MedicalProfile(user_id=user.id, specialty="Flight Medicine / Aerospace Physiology"))
    return user


def seed_demo(db: Session) -> dict:
    now = datetime.now(timezone.utc)
    staff = {
        a["email"]: _create_user(db, name=a["name"], email=a["email"], role=a["role"])
        for a in DEMO_ACCOUNTS
        if a["role"] != "astronaut"
    }

    astronauts: dict[str, User] = {}
    for name, callsign, age, sex, height, weight, hours in ASTRONAUTS:
        email = f"{callsign.lower()}@cosmicare.demo"
        astronauts[callsign] = _create_user(
            db,
            name=name,
            email=email,
            role="astronaut",
            callsign=callsign,
            age=age,
            sex=sex,
            height=height,
            weight=weight,
            flight_hours=hours,
        )
    staff["reyes@cosmicare.demo"] = astronauts["REYES"]
    db.commit()

    medical = staff["hale@cosmicare.demo"]
    control = staff["control@cosmicare.demo"]
    created_missions: list[Mission] = []

    for spec in MISSIONS:
        preset = MISSION_PRESETS[spec["preset"]]
        mission = Mission(
            code=preset["code"],
            name=preset["name"],
            category=preset["category"],
            destination=preset["destination"],
            planned_duration_days=preset["planned_duration_days"],
            elapsed_duration_days=spec["elapsed"],
            phase=spec["phase"],
            crew_size=len(spec["crew"]),
            gravity_g=preset["gravity_g"],
            radiation_environment=preset["radiation_environment"],
            radiation_dose_rate_msv_day=preset["radiation_dose_rate_msv_day"],
            comm_delay_seconds=preset["comm_delay_seconds"],
            exercise_available=preset["exercise_available"],
            medical_support=preset["medical_support"],
            environment=preset["environment"],
            monitoring_profile=preset["monitoring_profile"],
            description=preset["description"],
        )
        db.add(mission)
        db.flush()
        db.add(
            TelemetryScenario(
                mission_id=mission.id,
                name=spec["scenario"].get("scenario_id", "baseline").replace("-", " ").title(),
                seed=2026,
                config=spec["scenario"],
                is_active=True,
            )
        )
        seats = ["CDR", "PLT", "MS1", "MS2", "MS3", "MS4"]
        for i, callsign in enumerate(spec["crew"]):
            db.add(
                MissionAssignment(
                    mission_id=mission.id,
                    user_id=astronauts[callsign].id,
                    role_on_mission="crew" if i > 0 else "commander",
                    seat=seats[i],
                )
            )
        db.add(
            MissionAssignment(
                mission_id=mission.id, user_id=medical.id, role_on_mission="flight_surgeon", seat="MED"
            )
        )
        db.add(
            MissionAssignment(
                mission_id=mission.id, user_id=control.id, role_on_mission="flight_director", seat="FD"
            )
        )
        created_missions.append(mission)

    # Pre-mission profile: no in-flight telemetry, readiness only.
    pre = MISSION_PRESETS[2]
    pre_mission = Mission(
        code="GATEWAY-READY",
        name="Gateway Crew Readiness — Pre-Launch",
        category="Lunar mission (pre-mission)",
        destination="NRHO / Lunar Gateway",
        planned_duration_days=pre["planned_duration_days"],
        elapsed_duration_days=0,
        phase="pre_mission",
        crew_size=1,
        gravity_g=pre["gravity_g"],
        radiation_environment=pre["radiation_environment"],
        radiation_dose_rate_msv_day=pre["radiation_dose_rate_msv_day"],
        comm_delay_seconds=pre["comm_delay_seconds"],
        exercise_available=True,
        medical_support=pre["medical_support"],
        environment=pre["environment"],
        monitoring_profile=pre["monitoring_profile"],
        description="Pre-flight readiness phase: baselines, physical and mental readiness, no in-flight telemetry.",
    )
    db.add(pre_mission)
    db.flush()
    db.add(
        MissionAssignment(
            mission_id=pre_mission.id, user_id=astronauts["MERCER"].id, role_on_mission="crew", seat="CDR"
        )
    )
    db.add(
        MissionAssignment(
            mission_id=pre_mission.id, user_id=medical.id, role_on_mission="flight_surgeon", seat="MED"
        )
    )
    db.add(
        MissionAssignment(
            mission_id=pre_mission.id, user_id=control.id, role_on_mission="flight_director", seat="FD"
        )
    )
    db.commit()

    for mission, spec in zip(created_missions, MISSIONS):
        simulation.regenerate_mission(db, mission, seed=2026, config=spec["scenario"])

    # Baseline + assessment history for the demonstrator crew.
    reyes = astronauts["REYES"]
    voss = astronauts["VOSS"]
    for user_id, mood, stress, isolation, note in [
        (reyes.id, 7, 5, 4, "Sleeping well; exercise sessions feel productive."),
        (voss.id, 3, 8, 8, "Sleep is fragmented; missing home more than expected."),
    ]:
        profile = db.scalar(select(AstronautProfile).where(AstronautProfile.user_id == user_id))
        mission = created_missions[0] if user_id == reyes.id else created_missions[1]
        db.add(
            Assessment(
                astronaut_id=profile.id,
                mission_id=mission.id,
                kind="mental",
                answers={"mood": mood, "stress": stress, "isolation": isolation, "sleep_quality": 6},
                scores={
                    "mood": mood,
                    "stress": stress,
                    "isolation": isolation,
                    "sleep_quality": 6,
                    "wellbeing_index": round((mood + (10 - stress)) / 2 * 10, 1),
                    "safety_flag": False,
                },
                notes=note,
                is_private=True,
                created_at=now - timedelta(days=2),
            )
        )
        db.add(
            Assessment(
                astronaut_id=profile.id,
                mission_id=mission.id,
                kind="daily",
                answers={"mood": mood, "stress": stress, "sleep_hours": 7.1, "exercise_minutes": 42},
                scores={"mood": mood, "stress": stress, "wellbeing_index": round(mood * 10, 1)},
                notes="Routine daily log.",
                is_private=True,
                created_at=now - timedelta(days=1),
            )
        )
    db.commit()

    for mission, spec in zip(created_missions, MISSIONS):
        for callsign in spec["crew"]:
            profile = db.scalar(
                select(AstronautProfile).where(AstronautProfile.user_id == astronauts[callsign].id)
            )
            intelligence.refresh_intelligence(db, profile, mission, create_incidents=True)

    # Pre-seeded incidents demonstrating the lifecycle.
    iss = created_missions[0]
    mars = created_missions[1]
    reyes_profile = db.scalar(select(AstronautProfile).where(AstronautProfile.user_id == reyes.id))
    voss_profile = db.scalar(select(AstronautProfile).where(AstronautProfile.user_id == voss.id))

    incident = Incident(
        mission_id=iss.id,
        astronaut_id=reyes_profile.id,
        source="astronaut_report",
        severity="moderate",
        title="Reported dizziness on standing after exercise",
        description=(
            "Astronaut reported transient light-headedness when standing after a resistive session. "
            "Simulated blood pressure showed a modest drop. Crew medical officer notified."
        ),
        status="acknowledged",
        assigned_to=medical.id,
        acknowledged_at=now - timedelta(hours=6),
        created_at=now - timedelta(hours=8),
    )
    db.add(incident)
    db.flush()
    db.add_all(
        [
            IncidentEvent(incident_id=incident.id, actor_id=reyes.id, action="created", note="Reported by crew."),
            IncidentEvent(
                incident_id=incident.id,
                actor_id=medical.id,
                action="acknowledged",
                note="Fluid intake increased; repeat orthostatic check in 12 hours.",
            ),
        ]
    )
    db.add(
        Intervention(
            astronaut_id=reyes_profile.id,
            mission_id=iss.id,
            incident_id=incident.id,
            recorded_by=medical.id,
            category="clinical",
            description="Oral fluid loading (500 ml) and seated rest, followed by a repeat orthostatic check.",
            outcome="improving",
            follow_up_days=1,
        )
    )
    db.add(
        Incident(
            mission_id=mars.id,
            astronaut_id=voss_profile.id,
            source="rule_engine",
            severity="high",
            title="Sustained sleep restriction in deep-space transit",
            description=(
                "Deterministic rule engine flagged a multi-day sleep deficit. Communication delay limits "
                "real-time clinical support; asynchronous review requested."
            ),
            status="new",
            created_at=now - timedelta(hours=2),
        )
    )
    db.commit()

    db.add_all(
        [
            Message(
                mission_id=iss.id,
                sender_id=reyes.id,
                recipient_id=medical.id,
                channel="direct",
                priority="normal",
                body="Feeling better after the fluids. I'll repeat the standing BP after lunch and send it through.",
                delivered_at=now - timedelta(hours=4),
            ),
            Message(
                mission_id=iss.id,
                sender_id=medical.id,
                recipient_id=reyes.id,
                channel="direct",
                priority="priority",
                body="Acknowledged. Keep the compression garment on for today's exercise and log any symptoms.",
                delivered_at=now - timedelta(hours=3),
            ),
            Message(
                mission_id=mars.id,
                sender_id=control.id,
                recipient_id=None,
                channel="announcement",
                priority="normal",
                body="Daily planning package uploaded. Next comm window in 38 minutes; queue non-urgent traffic.",
                delivered_at=now - timedelta(minutes=50),
            ),
        ]
    )
    for user in astronauts.values():
        db.add(
            Notification(
                user_id=user.id,
                title="Welcome to COSMICARE",
                body="Your simulated health record is ready. All telemetry is generated by the demo simulation engine.",
                level="info",
                link="/app",
            )
        )
    db.commit()

    from .routers.research import ensure_sample_datasets

    ensure_sample_datasets(db)

    return {
        "users": len(ASTRONAUTS) + len(DEMO_ACCOUNTS),
        "missions": len(created_missions) + 1,
        "demo_accounts": DEMO_ACCOUNTS,
        "password": DEMO_PASSWORD,
    }


def reset_and_seed(db: Session) -> dict:
    db.close()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    fresh = SessionLocal()
    try:
        return seed_demo(fresh)
    finally:
        fresh.close()


def ensure_mission_control_demo(db: Session) -> dict:
    """Add the Mission Control demonstration scenario without resetting existing data."""
    now = datetime.now(timezone.utc)
    demo_marker = "SYNTHETIC DEMONSTRATION DATA"
    active_code = "COSMICARE-MC-DEMO-2026"
    upcoming_code = "COSMICARE-MC-UPCOMING-2026"
    active = db.scalar(select(Mission).where(Mission.code == active_code))
    upcoming = db.scalar(select(Mission).where(Mission.code == upcoming_code))

    # Never adopt or modify a mission that happens to use one of the reserved codes.
    if active and demo_marker not in active.description:
        return {"created": False, "reason": "reserved mission code already in use"}
    if upcoming and demo_marker not in upcoming.description:
        return {"created": False, "reason": "reserved mission code already in use"}
    created = active is None or upcoming is None

    crew_specs = [
        {"callsign": "REYES", "heart_rate": 72.0, "spo2": 98.1, "body_temp": 36.7, "sleep_hours": 7.4, "stress": 2.8, "severity": "low"},
        {"callsign": "LIMA", "heart_rate": 68.0, "spo2": 98.5, "body_temp": 36.6, "sleep_hours": 7.8, "stress": 2.2, "severity": "low"},
        {"callsign": "PARK", "heart_rate": 91.0, "spo2": 96.7, "body_temp": 37.0, "sleep_hours": 5.8, "stress": 5.8, "severity": "moderate"},
        {"callsign": "VOSS", "heart_rate": 96.0, "spo2": 96.2, "body_temp": 37.1, "sleep_hours": 5.4, "stress": 6.4, "severity": "moderate"},
        {"callsign": "OKAFOR", "heart_rate": 112.0, "spo2": 94.3, "body_temp": 37.5, "sleep_hours": 4.7, "stress": 8.1, "severity": "critical"},
    ]
    crew_profiles: list[AstronautProfile] = []
    for spec in crew_specs:
        profile = db.scalar(
            select(AstronautProfile)
            .join(User, User.id == AstronautProfile.user_id)
            .where(User.email == f"{spec['callsign'].lower()}@cosmicare.demo")
        )
        if profile:
            crew_profiles.append(profile)

    # A partially seeded development database may not yet have the full demo crew.
    for name, callsign, age, sex, height, weight, flight_hours in ASTRONAUTS:
        if len(crew_profiles) >= len(crew_specs):
            break
        if any(p.callsign == callsign for p in crew_profiles):
            continue
        email = f"mc-demo-{callsign.lower()}@cosmicare.demo"
        user = db.scalar(select(User).where(User.email == email))
        if user and user.role == "astronaut" and user.astronaut_profile:
            profile = user.astronaut_profile
        elif user:
            continue
        else:
            user = _create_user(
                db,
                name=name,
                email=email,
                role="astronaut",
                callsign=callsign,
                age=age,
                sex=sex,
                height=height,
                weight=weight,
                flight_hours=flight_hours,
            )
            db.flush()
            profile = user.astronaut_profile
        crew_profiles.append(profile)
    if len(crew_profiles) < len(crew_specs):
        raise RuntimeError("Unable to provision five synthetic Mission Control crew profiles")

    control = db.scalar(select(User).where(User.role == "mission_control").order_by(User.id))
    if not control:
        email = "mc-demo-control@cosmicare.demo"
        if db.scalar(select(User.id).where(User.email == email)):
            raise RuntimeError("Mission Control demo account email is already in use")
        control = _create_user(
            db, name="Mission Control Demonstrator", email=email, role="mission_control"
        )
    medical = db.scalar(select(User).where(User.role == "medical").order_by(User.id))

    if not active:
        active = Mission(
            code=active_code,
            name="Orbital Expedition — Crew Health Demonstration",
            category="Long-duration orbital demonstration",
            destination="Low Earth Orbit",
            planned_duration_days=180,
            elapsed_duration_days=64,
            phase="in_flight",
            status="active",
            crew_size=len(crew_profiles),
            gravity_g=0.0,
            radiation_environment="LEO",
            radiation_dose_rate_msv_day=0.45,
            comm_delay_seconds=2,
            exercise_available=True,
            medical_support="onboard",
            environment={
                "launch_date": (now - timedelta(days=64)).date().isoformat(),
                "data_class": "synthetic_demonstration",
            },
            monitoring_profile={"focus": ["cardiovascular", "sleep", "wellness"], "weights": {}},
            description=f"{demo_marker}. Fictional crew and simulated telemetry for interface demonstration only.",
        )
        db.add(active)
        db.flush()
    if not upcoming:
        upcoming = Mission(
            code=upcoming_code,
            name="Lunar Gateway — Upcoming Crew Readiness",
            category="Upcoming lunar mission",
            destination="Near-Rectilinear Halo Orbit",
            planned_duration_days=120,
            elapsed_duration_days=0,
            phase="pre_mission",
            status="upcoming",
            crew_size=3,
            gravity_g=0.16,
            radiation_environment="deep_space",
            radiation_dose_rate_msv_day=1.2,
            comm_delay_seconds=2,
            exercise_available=True,
            medical_support="telemedicine_delayed",
            environment={
                "launch_date": (now + timedelta(days=45)).date().isoformat(),
                "data_class": "synthetic_demonstration",
            },
            monitoring_profile={"focus": ["readiness", "sleep", "cardiovascular"], "weights": {}},
            description=f"{demo_marker}. Planned mission dates and crew size are fictional demonstration values.",
        )
        db.add(upcoming)
        db.flush()

    for profile in crew_profiles:
        if not db.scalar(
            select(MissionAssignment.id).where(
                MissionAssignment.mission_id == active.id,
                MissionAssignment.user_id == profile.user_id,
            )
        ):
            db.add(
                MissionAssignment(
                    mission_id=active.id,
                    user_id=profile.user_id,
                    role_on_mission="crew",
                    seat=f"MS{crew_profiles.index(profile) + 1}",
                )
            )
    for mission in (active, upcoming):
        if not db.scalar(
            select(MissionAssignment.id).where(
                MissionAssignment.mission_id == mission.id,
                MissionAssignment.user_id == control.id,
            )
        ):
            db.add(
                MissionAssignment(
                    mission_id=mission.id,
                    user_id=control.id,
                    role_on_mission="flight_director",
                    seat="FD",
                )
            )
        if medical and not db.scalar(
            select(MissionAssignment.id).where(
                MissionAssignment.mission_id == mission.id,
                MissionAssignment.user_id == medical.id,
            )
        ):
            db.add(
                MissionAssignment(
                    mission_id=mission.id,
                    user_id=medical.id,
                    role_on_mission="flight_surgeon",
                    seat="MED",
                )
            )
    if not db.scalar(select(TelemetryScenario.id).where(TelemetryScenario.mission_id == active.id)):
        db.add(
            TelemetryScenario(
                mission_id=active.id,
                name=demo_marker,
                seed=2026,
                config={
                    "scenario_id": "mc-synthetic-demo-2026",
                    "stress": 0.3,
                    "sleep_penalty": 0.35,
                    "solar_event_day": 40,
                    "solar_event_dose_msv": 18.0,
                    "solar_event_label": f"{demo_marker} — modelled solar event",
                },
                is_active=True,
            )
        )
    db.commit()

    telemetry_exists = db.scalar(
        select(TelemetrySnapshot.id)
        .where(
            TelemetrySnapshot.mission_id == active.id,
            TelemetrySnapshot.scenario_id == "mc-synthetic-demo-2026",
        )
        .limit(1)
    )
    if not telemetry_exists:
        from . import simulation

        scenario = db.scalar(
            select(TelemetryScenario)
            .where(TelemetryScenario.mission_id == active.id)
            .order_by(TelemetryScenario.created_at.desc())
        )
        simulation.regenerate_mission(
            db, active, seed=2026, config=scenario.config, now=now - timedelta(days=1)
        )

    generated_samples = db.scalars(
        select(TelemetrySnapshot).where(
            TelemetrySnapshot.mission_id == active.id,
            TelemetrySnapshot.scenario_id == "mc-synthetic-demo-2026",
        )
    ).all()
    now_naive = now.replace(tzinfo=None)
    for snapshot in generated_samples:
        recorded_at = snapshot.recorded_at
        comparison_time = recorded_at.replace(tzinfo=None) if recorded_at.tzinfo else recorded_at
        if comparison_time > now_naive:
            snapshot.recorded_at = recorded_at - timedelta(days=1)
    db.commit()

    medical_id = medical.id if medical else control.id
    for index, (profile, spec) in enumerate(zip(crew_profiles, crew_specs)):
        if not db.scalar(
            select(TelemetrySnapshot.id).where(
                TelemetrySnapshot.mission_id == active.id,
                TelemetrySnapshot.astronaut_id == profile.id,
                TelemetrySnapshot.scenario_id == "mc-synthetic-demo-2026-current",
            )
        ):
            db.add(
                TelemetrySnapshot(
                    astronaut_id=profile.id,
                    mission_id=active.id,
                    recorded_at=now,
                    heart_rate=spec["heart_rate"],
                    hrv=48.0 - index * 2.2,
                    systolic=112.0 + index * 3.0,
                    diastolic=72.0 + index * 1.5,
                    spo2=spec["spo2"],
                    resp_rate=14.0 + index * 0.7,
                    body_temp=spec["body_temp"],
                    steps=7200 - index * 550,
                    sleep_hours=spec["sleep_hours"],
                    sleep_quality=max(3.0, 8.3 - index * 0.9),
                    exercise_minutes=42.0 - index * 4.0,
                    recovery_score=max(28.0, 88.0 - index * 12.0),
                    source="simulated",
                    scenario_id="mc-synthetic-demo-2026-current",
                    sensor_status="nominal" if spec["severity"] in ("low", "moderate") else "review",
                )
            )
        observation_ref = f"{demo_marker}: simulated mission-load stress indicator"
        if not db.scalar(
            select(HealthObservation.id).where(
                HealthObservation.astronaut_id == profile.id,
                HealthObservation.mission_id == active.id,
                HealthObservation.source_ref == observation_ref,
            )
        ):
            db.add(
                HealthObservation(
                    astronaut_id=profile.id,
                    mission_id=active.id,
                    metric="simulated_stress_indicator",
                    value=spec["stress"],
                    unit="0–10",
                    method="derived_model",
                    source_ref=observation_ref,
                    recorded_at=now,
                )
            )
        insight_title = f"{demo_marker} — {profile.callsign} monitoring scenario"
        if not db.scalar(
            select(AIInsight.id).where(
                AIInsight.astronaut_id == profile.id,
                AIInsight.mission_id == active.id,
                AIInsight.title == insight_title,
            )
        ):
            db.add(
                AIInsight(
                    astronaut_id=profile.id,
                    mission_id=active.id,
                    kind="rule",
                    domain="demonstration",
                    severity=spec["severity"],
                    title=insight_title,
                    summary=(
                        f"Synthetic scenario only. Simulated heart rate {spec['heart_rate']:.0f} bpm, "
                        f"SpO2 {spec['spo2']:.1f}%, and sleep {spec['sleep_hours']:.1f} hours. "
                        "Review the trend; this is not a diagnosis."
                    ),
                    explanation={"data_class": "synthetic_demonstration"},
                    confidence=1.0,
                    data_class="synthetic_demo",
                    status="open",
                )
            )
    db.commit()

    incident_specs = [
        {
            "title": f"{demo_marker} — elevated simulated physiological indicators",
            "astronaut": crew_profiles[4],
            "severity": "critical",
            "status": "new",
            "description": (
                "Demonstration scenario: simulated heart rate and oxygen saturation have shifted from "
                "this fictional crew member's synthetic baseline. Recommended response: prompt medical "
                "review and repeat the simulated check. Not a real medical alert."
            ),
        },
        {
            "title": f"{demo_marker} — modelled radiation exposure review",
            "astronaut": crew_profiles[2],
            "severity": "high",
            "status": "acknowledged",
            "description": (
                "Demonstration scenario: modelled mission dose includes a configured event increment; "
                "this is not a dosimeter measurement. Recommended response: review the scenario profile "
                "with mission operations."
            ),
        },
    ]
    for spec in incident_specs:
        incident = db.scalar(
            select(Incident).where(
                Incident.mission_id == active.id,
                Incident.source == "synthetic_demo",
                Incident.title == spec["title"],
            )
        )
        if not incident:
            incident = Incident(
                mission_id=active.id,
                astronaut_id=spec["astronaut"].id,
                source="synthetic_demo",
                severity=spec["severity"],
                title=spec["title"],
                description=spec["description"],
                status=spec["status"],
                assigned_to=medical_id,
                acknowledged_at=now - timedelta(minutes=12) if spec["status"] == "acknowledged" else None,
                created_at=now - timedelta(minutes=24),
            )
            db.add(incident)
            db.flush()
            db.add(
                IncidentEvent(
                    incident_id=incident.id,
                    actor_id=control.id,
                    action="created",
                    note=demo_marker,
                    created_at=now - timedelta(minutes=24),
                )
            )
            db.add(
                IncidentEvent(
                    incident_id=incident.id,
                    actor_id=control.id,
                    action="assigned",
                    note=f"{demo_marker} — assigned for review.",
                    created_at=now - timedelta(minutes=23),
                )
            )
            if spec["status"] == "acknowledged":
                db.add(
                    IncidentEvent(
                        incident_id=incident.id,
                        actor_id=medical_id,
                        action="acknowledged",
                        note=f"{demo_marker} — review queued.",
                        created_at=now - timedelta(minutes=12),
                    )
                )
        elif incident.assigned_to is None:
            incident.assigned_to = medical_id
            db.add(
                IncidentEvent(
                    incident_id=incident.id,
                    actor_id=control.id,
                    action="assigned",
                    note=f"{demo_marker} — assigned for review.",
                    created_at=now,
                )
            )
    db.commit()
    return {
        "created": created,
        "active_mission_id": active.id,
        "upcoming_mission_id": upcoming.id,
        "crew_profiles": len(crew_profiles),
    }


def seed_if_empty() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.scalar(select(User.id).limit(1)):
            return
        seed_demo(db)
    finally:
        db.close()
