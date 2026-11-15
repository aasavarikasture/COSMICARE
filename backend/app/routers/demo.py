"""Demonstration mode: status, seeded state and reset.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Incident, Mission, User
from ..reference import MISSION_PRESETS
from ..security import audit, get_current_user, require_roles
from ..seed import DEMO_ACCOUNTS, reset_and_seed

router = APIRouter(prefix="/api/demo", tags=["demo"])


@router.get("/status")
def demo_status(
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    missions = list(db.scalars(select(Mission)).all())
    return {
        "seeded": len(missions) > 0,
        "missions": [{"id": m.id, "name": m.name, "phase": m.phase, "category": m.category} for m in missions],
        "demo_accounts": [
            {"role": a["role"], "email": a["email"], "name": a["name"]}
            for a in DEMO_ACCOUNTS
        ],
        "scenarios": [
            {"name": "Baseline", "config": {"stress": 0, "sleep_penalty": 0}},
            {"name": "Sleep degradation", "config": {"sleep_penalty": 1.4, "stress": 0.35}},
            {"name": "Radiation event", "config": {"solar_event_day": 3, "solar_event_dose_msv": 18}},
            {"name": "Sensor malfunction", "config": {"sensor_fault": True, "anomaly_bias": 0.6}},
            {"name": "High-stress isolation", "config": {"stress": 0.8, "sleep_penalty": 0.9}},
            {"name": "Physiological deterioration", "config": {"anomaly_bias": 1.4, "stress": 0.5}},
        ],
        "presets": MISSION_PRESETS,
        "warning": "All telemetry is simulated. Demo credentials are for the hackathon build only.",
    }


@router.post("/reset")
def reset_demo(
    request: Request,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    """Destructive: restore the known initial demonstration state."""
    audit(db, user, "demo.reset", "system", "", "full demo reset requested", request)
    summary = reset_and_seed(db)
    return {"ok": True, **summary, "note": "Database rebuilt from the deterministic seed."}


@router.get("/credentials")
def credentials(user: User = Depends(require_roles("admin"))):
    """Demo account info without passwords for display."""
    return {
        "accounts": [
            {"role": a["role"], "email": a["email"], "name": a["name"]}
            for a in DEMO_ACCOUNTS
        ],
        "note": "These are demonstration accounts on isolated demo data. Passwords are not exposed.",
    }