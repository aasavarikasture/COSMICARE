"""Mission configuration, presets, crew assignment and scenario simulation."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..database import get_db
from .. import simulation
from ..models import (
    AstronautProfile,
    Mission,
    MissionAssignment,
    Notification,
    TelemetryScenario,
    User,
)
from ..reference import MISSION_PRESETS, RADIATION_ENVIRONMENTS
from ..schemas import AssignmentIn, MissionIn, MissionUpdateIn, ScenarioIn
from ..security import audit, ensure_mission_access, get_current_user, require_roles
from ..serializers import mission_out
from ..services import intelligence

router = APIRouter(prefix="/api/missions", tags=["missions"])


def accessible_missions(user: User, db: Session) -> list[Mission]:
    if user.role == "admin":
        return list(db.scalars(select(Mission).order_by(Mission.created_at.desc())).all())
    ids = db.scalars(
        select(MissionAssignment.mission_id).where(
            MissionAssignment.user_id == user.id, MissionAssignment.is_active.is_(True)
        )
    ).all()
    if not ids:
        return []
    return list(db.scalars(select(Mission).where(Mission.id.in_(ids)).order_by(Mission.created_at.desc())).all())


def active_scenario(db: Session, mission_id: int) -> TelemetryScenario | None:
    return db.scalar(
        select(TelemetryScenario)
        .where(TelemetryScenario.mission_id == mission_id, TelemetryScenario.is_active.is_(True))
        .order_by(TelemetryScenario.created_at.desc())
    )


def scenario_config(db: Session, mission_id: int) -> tuple[int, dict]:
    sc = active_scenario(db, mission_id)
    if not sc:
        return 2026, {"scenario_id": "baseline"}
    cfg = dict(sc.config or {})
    cfg.setdefault("scenario_id", f"scenario-{sc.id}")
    return sc.seed, cfg


@router.get("/presets")
def presets(user: User = Depends(get_current_user)):
    return {
        "presets": MISSION_PRESETS,
        "radiation_environments": RADIATION_ENVIRONMENTS,
        "note": "Presets are illustrative demo profiles, not operational mission plans.",
    }


@router.get("")
def list_missions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    missions = accessible_missions(user, db)
    return {"missions": [mission_out(m, db) for m in missions]}


@router.post("", status_code=201)
def create_mission(
    payload: MissionIn,
    request: Request,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    code = payload.code or f"MISSION-{payload.name[:6].upper().replace(' ', '-')}"
    base = code
    n = 1
    while db.scalar(select(Mission).where(Mission.code == code)):
        n += 1
        code = f"{base}-{n}"

    mission = Mission(
        code=code,
        name=payload.name,
        category=payload.category,
        destination=payload.destination,
        planned_duration_days=payload.planned_duration_days,
        elapsed_duration_days=min(payload.elapsed_duration_days, payload.planned_duration_days),
        phase=payload.phase,
        crew_size=payload.crew_size,
        gravity_g=payload.gravity_g,
        radiation_environment=payload.radiation_environment,
        radiation_dose_rate_msv_day=payload.radiation_dose_rate_msv_day,
        comm_delay_seconds=payload.comm_delay_seconds,
        exercise_available=payload.exercise_available,
        medical_support=payload.medical_support,
        description=payload.description,
        environment=payload.environment or {},
        monitoring_profile=payload.monitoring_profile or {"focus": ["cardiovascular", "sleep"], "weights": {}},
    )
    db.add(mission)
    db.flush()

    if payload.create_demo_crew:
        _attach_demo_crew(db, mission, payload.crew_size)

    db.add(
        TelemetryScenario(
            mission_id=mission.id,
            name="Baseline deterministic scenario",
            seed=2026,
            config={"scenario_id": "baseline"},
        )
    )
    db.commit()
    audit(db, user, "mission.create", "mission", mission.id, mission.code, request)

    mission.elapsed_duration_days = max(mission.elapsed_duration_days, 1)
    simulation.regenerate_mission(db, mission, seed=2026, config={"scenario_id": "baseline"})
    for astronaut in simulation.crew_for_mission(db, mission):
        intelligence.refresh_intelligence(db, astronaut, mission)
    return mission_out(mission, db)


def _attach_demo_crew(db: Session, mission: Mission, crew_size: int) -> None:
    """Attach existing astronauts with the fewest assignments, for demo convenience."""
    existing = db.scalars(
        select(MissionAssignment.user_id).where(MissionAssignment.mission_id == mission.id)
    ).all()
    candidates = list(
        db.scalars(
            select(User)
            .where(User.role == "astronaut", User.is_active.is_(True), User.id.notin_(existing or [0]))
            .order_by(User.id)
        ).all()
    )
    seats = ["CDR", "PLT", "MS1", "MS2", "MS3", "MS4", "MS5", "MS6"]
    for i, user in enumerate(candidates[:crew_size]):
        db.add(
            MissionAssignment(
                mission_id=mission.id,
                user_id=user.id,
                role_on_mission="crew",
                seat=seats[i] if i < len(seats) else f"MS{i}",
            )
        )


@router.get("/{mission_id}")
def get_mission(
    mission_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ensure_mission_access(user, mission_id, db)
    mission = db.get(Mission, mission_id)
    if not mission:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mission not found")
    sc = active_scenario(db, mission_id)
    data = mission_out(mission, db)
    data["scenario"] = (
        {"id": sc.id, "name": sc.name, "seed": sc.seed, "config": sc.config} if sc else None
    )
    return data


@router.patch("/{mission_id}")
def update_mission(
    mission_id: int,
    payload: MissionUpdateIn,
    request: Request,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    mission = db.get(Mission, mission_id)
    if not mission:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mission not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(mission, field, value)
    db.commit()
    audit(db, user, "mission.update", "mission", mission.id, "", request)
    return mission_out(mission, db)


@router.get("/{mission_id}/crew")
def crew(
    mission_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ensure_mission_access(user, mission_id, db)
    mission = db.get(Mission, mission_id)
    if not mission:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mission not found")
    return {"mission_id": mission_id, "crew": mission_out(mission, db)["crew"]}


@router.get("/{mission_id}/configuration")
def configuration(
    mission_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ensure_mission_access(user, mission_id, db)
    mission = db.get(Mission, mission_id)
    if not mission:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mission not found")
    return {
        **mission_out(mission, db),
        "available_radiation_environments": RADIATION_ENVIRONMENTS,
        "adapted_monitoring": mission.monitoring_profile,
        "adaptation_note": "Monitoring weights and rule sensitivity adapt to this profile; no destination is hard-coded.",
    }


@router.post("/{mission_id}/assignments", status_code=201)
def assign(
    mission_id: int,
    payload: AssignmentIn,
    request: Request,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    mission = db.get(Mission, mission_id)
    target = db.get(User, payload.user_id)
    if not mission or not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mission or user not found")
    existing = db.scalar(
        select(MissionAssignment).where(
            MissionAssignment.mission_id == mission_id, MissionAssignment.user_id == target.id
        )
    )
    if existing:
        existing.is_active = True
        existing.role_on_mission = payload.role_on_mission
        existing.seat = payload.seat
    else:
        db.add(
            MissionAssignment(
                mission_id=mission_id,
                user_id=target.id,
                role_on_mission=payload.role_on_mission,
                seat=payload.seat,
            )
        )
    db.commit()
    audit(db, user, "mission.assign", "mission", mission_id, f"user={target.id}", request)
    db.add(
        Notification(
            user_id=target.id,
            title=f"Assigned to {mission.name}",
            body="A mission assignment was created for your account.",
            level="info",
            link=f"/app/missions/{mission.id}",
        )
    )
    db.commit()
    return {"ok": True}


@router.delete("/{mission_id}/assignments/{user_id}")
def unassign(
    mission_id: int,
    user_id: int,
    request: Request,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    row = db.scalar(
        select(MissionAssignment).where(
            MissionAssignment.mission_id == mission_id, MissionAssignment.user_id == user_id
        )
    )
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found")
    db.delete(row)
    db.commit()
    audit(db, user, "mission.unassign", "mission", mission_id, f"user={user_id}", request)
    return {"ok": True}


@router.post("/{mission_id}/scenario")
def set_scenario(
    mission_id: int,
    payload: ScenarioIn,
    request: Request,
    user: User = Depends(require_roles("admin", "mission_control")),
    db: Session = Depends(get_db),
):
    """Replace the active simulation scenario and regenerate reproducible history."""
    if user.role != "admin":
        ensure_mission_access(user, mission_id, db)
    mission = db.get(Mission, mission_id)
    if not mission:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mission not found")

    db.execute(
        delete(TelemetryScenario).where(
            TelemetryScenario.mission_id == mission_id, TelemetryScenario.is_active.is_(True)
        )
    )
    config = payload.model_dump()
    config["scenario_id"] = f"scenario-{mission_id}-{payload.seed}"
    db.add(
        TelemetryScenario(
            mission_id=mission_id,
            name=payload.name,
            seed=payload.seed,
            config=config,
            is_active=True,
        )
    )
    db.commit()
    summary = simulation.regenerate_mission(
        db, mission, seed=payload.seed, config=config
    )
    for astronaut in simulation.crew_for_mission(db, mission):
        intelligence.refresh_intelligence(db, astronaut, mission)
    audit(db, user, "mission.scenario", "mission", mission_id, payload.name, request)
    return {"ok": True, **summary, "scenario": config}


@router.post("/{mission_id}/advance")
def advance_mission(
    mission_id: int,
    request: Request,
    user: User = Depends(require_roles("admin", "mission_control")),
    db: Session = Depends(get_db),
):
    """Demo action: advance one mission day and append new simulated samples."""
    if user.role != "admin":
        ensure_mission_access(user, mission_id, db)
    mission = db.get(Mission, mission_id)
    if not mission:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mission not found")
    mission.elapsed_duration_days = min(mission.planned_duration_days + 30, mission.elapsed_duration_days + 1)
    if mission.phase == "pre_mission":
        mission.phase = "in_flight"
    db.commit()
    seed, cfg = scenario_config(db, mission_id)
    created = simulation.append_latest(db, mission, seed, cfg)
    results = []
    for snap in created:
        astronaut = db.get(AstronautProfile, snap.astronaut_id)
        if astronaut:
            result = intelligence.refresh_intelligence(db, astronaut, mission, create_incidents=True)
            results.append(
                {"astronaut_id": astronaut.id, "incidents_created": result["incidents_created"]}
            )
    audit(db, user, "mission.advance", "mission", mission_id, "", request)
    return {
        "mission_day": mission.elapsed_duration_days,
        "phase": mission.phase,
        "samples": len(created),
        "crew_results": results,
    }
