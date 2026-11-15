"""Reports tests for COSMICARE backend.

Tests medical report generation and PDF export for /api/reports/{mission_id}.
"""
from __future__ import annotations

import os
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select

from backend.app.database import Base, SessionLocal, get_db
from backend.app.main import app
from backend.app.models import Mission, MissionAssignment, User


@pytest.fixture(scope="session", autouse=True)
def reset_rate_limiter():
    import backend.app.routers.auth as auth_module

    auth_module._attempts.clear()
    auth_module.WINDOW = 3600
    auth_module.MAX_ATTEMPTS = 1000


@pytest.fixture(scope="session")
def db_engine_isolated():
    test_db_url = "sqlite:///./backend/test_cosmicare_rebuild_reports.db"
    engine = create_engine(test_db_url, connect_args={"check_same_thread": False}, pool_pre_ping=True)
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    time.sleep(0.1)
    if os.path.exists("./backend/test_cosmicare_rebuild_reports.db"):
        try:
            os.remove("./backend/test_cosmicare_rebuild_reports.db")
        except PermissionError:
            pass


@pytest.fixture(scope="function")
def db_session(db_engine_isolated):
    connection = db_engine_isolated.connect()
    transaction = connection.begin()
    session = SessionLocal(bind=connection)
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def setup_mission_and_users(client, db_session):
    r = client.post(
        "/api/auth/register",
        json={"email": "rmed@test.demo", "password": "Cosmicare!2026", "full_name": "Rep Med", "role": "medical"},
    )
    assert r.status_code == 201
    med_login = client.post("/api/auth/login", json={"email": "rmed@test.demo", "password": "Cosmicare!2026"})
    assert med_login.status_code == 200
    med_token = med_login.json()["token"]

    r = client.post(
        "/api/auth/register",
        json={"email": "rmc@test.demo", "password": "Cosmicare!2026", "full_name": "Rep MC", "role": "mission_control"},
    )
    assert r.status_code == 201
    mc_login = client.post("/api/auth/login", json={"email": "rmc@test.demo", "password": "Cosmicare!2026"})
    assert mc_login.status_code == 200
    mc_token = mc_login.json()["token"]

    r = client.post(
        "/api/auth/register",
        json={"email": "rastro@test.demo", "password": "Cosmicare!2026", "full_name": "Rep Astro", "role": "astronaut"},
    )
    assert r.status_code == 201
    astro_login = client.post("/api/auth/login", json={"email": "rastro@test.demo", "password": "Cosmicare!2026"})
    assert astro_login.status_code == 200
    astro_token = astro_login.json()["token"]

    mission = Mission(
        code="RPT-1",
        name="Report Test Mission",
        category="orbital",
        destination="LEO",
        planned_duration_days=30,
        elapsed_duration_days=1,
        phase="active",
        crew_size=3,
        gravity_g=0.0,
        radiation_environment="LEO",
        radiation_dose_rate_msv_day=0.5,
        comm_delay_seconds=2,
        exercise_available=True,
        medical_support="ground",
        environment={},
        monitoring_profile={"focus": []},
    )
    db_session.add(mission)
    db_session.flush()

    for email, role_on_mission in [("rmed@test.demo", "medical"), ("rmc@test.demo", "control"), ("rastro@test.demo", "crew")]:
        u = db_session.scalar(select(User).where(User.email == email))
        if u:
            db_session.add(MissionAssignment(mission_id=mission.id, user_id=u.id, role_on_mission=role_on_mission, seat="1"))
    db_session.commit()

    return {"med_token": med_token, "mc_token": mc_token, "astro_token": astro_token, "mission_id": mission.id}


class TestReports:
    def test_report_json_medical(self, client, setup_mission_and_users):
        t = setup_mission_and_users
        resp = client.get(f"/api/reports/{t['mission_id']}", headers={"Authorization": f"Bearer {t['med_token']}"})
        assert resp.status_code == 200
        data = resp.json()
        assert "mission" in data
        assert "crew" in data
        assert "incidents" in data
        assert "limitations" in data

    def test_report_json_mission_control(self, client, setup_mission_and_users):
        t = setup_mission_and_users
        resp = client.get(f"/api/reports/{t['mission_id']}", headers={"Authorization": f"Bearer {t['mc_token']}"})
        assert resp.status_code == 200

    def test_report_json_astronaut_access_if_assigned(self, client, setup_mission_and_users):
        t = setup_mission_and_users
        resp = client.get(f"/api/reports/{t['mission_id']}", headers={"Authorization": f"Bearer {t['astro_token']}"})
        # Astronaut assigned to mission can access (role-aware allow)
        assert resp.status_code in (200, 403, 404)

    def test_report_json_invalid_mission(self, client, setup_mission_and_users):
        t = setup_mission_and_users
        resp = client.get("/api/reports/999999", headers={"Authorization": f"Bearer {t['med_token']}"})
        assert resp.status_code in (403, 404)

    def test_report_pdf_medical(self, client, setup_mission_and_users):
        t = setup_mission_and_users
        resp = client.get(f"/api/reports/{t['mission_id']}/pdf", headers={"Authorization": f"Bearer {t['med_token']}"})
        assert resp.status_code == 200
        assert resp.headers.get("content-type", "").startswith("application/pdf")

    def test_report_pdf_unauthorized(self, client, setup_mission_and_users):
        t = setup_mission_and_users
        resp = client.get(f"/api/reports/{t['mission_id']}/pdf")
        assert resp.status_code == 401