"""Mission Control demo data is additive, synthetic, and safe to repeat."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy import func, select
from sqlalchemy.pool import StaticPool

from backend.app.database import Base, SessionLocal, get_db
from backend.app.main import app
from backend.app.models import (
    AIInsight,
    HealthObservation,
    Incident,
    Mission,
    TelemetrySnapshot,
    User,
)
from backend.app.seed import DEMO_PASSWORD, _create_user, ensure_mission_control_demo


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    session = SessionLocal(bind=engine)
    yield session
    session.close()
    engine.dispose()


@pytest.fixture
def client(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_mission_control_demo_seed_is_idempotent_and_role_scoped(client, db_session):
    crew = []
    crew_specs = [
        ("Crew Member One", "REYES"),
        ("Crew Member Two", "LIMA"),
        ("Crew Member Three", "PARK"),
        ("Crew Member Four", "VOSS"),
        ("Crew Member Five", "OKAFOR"),
    ]
    for name, callsign in crew_specs:
        crew.append(
            _create_user(
                db_session,
                name=name,
                email=f"{callsign.lower()}@cosmicare.demo",
                role="astronaut",
                password=DEMO_PASSWORD,
                callsign=callsign,
            )
        )
    control = _create_user(
        db_session,
        name="Mission Control",
        email="control@cosmicare.demo",
        role="mission_control",
        password=DEMO_PASSWORD,
    )
    _create_user(
        db_session,
        name="Flight Surgeon",
        email="hale@cosmicare.demo",
        role="medical",
        password=DEMO_PASSWORD,
    )
    db_session.commit()

    first = ensure_mission_control_demo(db_session)
    second = ensure_mission_control_demo(db_session)

    assert first["created"] is True
    assert second["created"] is False
    assert db_session.scalar(select(func.count()).select_from(Mission)) == 2
    assert db_session.scalar(select(func.count()).select_from(TelemetrySnapshot)) >= 5
    assert db_session.scalar(
        select(func.count()).select_from(HealthObservation).where(
            HealthObservation.metric == "simulated_stress_indicator"
        )
    ) == 5
    assert db_session.scalar(
        select(func.count()).select_from(AIInsight).where(
            AIInsight.title.like("SYNTHETIC DEMONSTRATION DATA%")
        )
    ) == 5
    assert db_session.scalar(select(func.count()).select_from(Incident)) == 2

    missions = list(db_session.scalars(select(Mission)).all())
    active = next(mission for mission in missions if mission.status == "active")
    upcoming = next(mission for mission in missions if mission.status == "upcoming")
    assert active.phase == "in_flight"
    assert active.crew_size == 5
    assert active.environment["data_class"] == "synthetic_demonstration"
    assert upcoming.phase == "pre_mission"
    assert upcoming.environment["launch_date"]

    login = client.post(
        "/api/auth/login",
        json={"email": "control@cosmicare.demo", "password": DEMO_PASSWORD},
    )
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['token']}"}

    mission_response = client.get("/api/missions", headers=headers)
    assert mission_response.status_code == 200
    assert len(mission_response.json()["missions"]) == 2
    astronaut_response = client.get("/api/astronauts", headers=headers)
    assert astronaut_response.status_code == 200
    assert len(astronaut_response.json()["astronauts"]) == 5
    health_response = client.get(
        f"/api/astronauts/{crew[-1].astronaut_profile.id}/health",
        headers=headers,
    )
    assert health_response.status_code == 200
    assert health_response.json()["latest"]["source"] == "simulated"
    assert health_response.json()["latest"]["heart_rate"] == 112.0
    assert any(
        observation["metric"] == "simulated_stress_indicator"
        for observation in health_response.json()["observations"]
    )

    incident_response = client.get("/api/incidents", headers=headers)
    assert incident_response.status_code == 200
    demo_incidents = [
        incident
        for incident in incident_response.json()["incidents"]
        if incident["source"] == "synthetic_demo"
    ]
    assert len(demo_incidents) == 2
    assert all(incident["assigned_to_name"] == "Flight Surgeon" for incident in demo_incidents)
    new_incident = next(
        incident for incident in incident_response.json()["incidents"] if incident["status"] == "new"
    )
    acknowledged = client.post(
        f"/api/incidents/{new_incident['id']}/acknowledge",
        headers=headers,
        json={},
    )
    assert acknowledged.status_code == 200
    resolved = client.patch(
        f"/api/incidents/{new_incident['id']}",
        headers=headers,
        json={"status": "resolved", "note": "Synthetic workflow test resolution"},
    )
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "resolved"

    astronaut_login = client.post(
        "/api/auth/login",
        json={"email": "reyes@cosmicare.demo", "password": DEMO_PASSWORD},
    )
    astronaut_headers = {"Authorization": f"Bearer {astronaut_login.json()['token']}"}
    private_incident_id = next(
        incident["id"]
        for incident in incident_response.json()["incidents"]
        if incident["astronaut_id"] == crew[-1].astronaut_profile.id
    )
    assert client.get(
        f"/api/incidents/{private_incident_id}",
        headers=astronaut_headers,
    ).status_code == 403

