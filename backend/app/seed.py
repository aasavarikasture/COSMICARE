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
    Assessment,
    AstronautProfile,
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


def seed_if_empty() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.scalar(select(User.id).limit(1)):
            return
        seed_demo(db)
    finally:
        db.close()
