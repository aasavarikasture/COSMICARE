"""Incident management tests for COSMICARE backend.

Tests incident lifecycle: create, acknowledge, resolve, status transitions,
persistence, and audit history.
"""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select

from backend.app.main import app
from backend.app.database import SessionLocal, Base, get_db
from backend.app.models import User, Mission, MissionAssignment


@pytest.fixture(scope="session", autouse=True)
def reset_rate_limiter():
    """Reset rate limiter state before each test session."""
    import backend.app.routers.auth as auth_module
    auth_module._attempts.clear()
    auth_module.WINDOW = 3600
    auth_module.MAX_ATTEMPTS = 1000


@pytest.fixture(scope="session")
def db_engine_isolated():
    """Create an isolated SQLite engine for testing."""
    test_db_url = "sqlite:///./test_cosmicare_rebuild_incidents.db"
    engine = create_engine(
        test_db_url,
        connect_args={"check_same_thread": False},
        pool_pre_ping=True,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    test_db_path = "./test_cosmicare_rebuild_incidents.db"
    if os.path.exists(test_db_path):
        try:
            os.remove(test_db_path)
        except PermissionError:
            pass


@pytest.fixture(scope="function")
def db_session(db_engine_isolated):
    """Create a fresh database session for each test."""
    connection = db_engine_isolated.connect()
    transaction = connection.begin()
    session = SessionLocal(bind=connection)
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture(scope="function")
def client(db_session):
    """Create a TestClient that uses the per-test session."""
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def auth_tokens(client, db_session):
    """Get auth tokens for medical, mission_control, and astronaut with mission access."""
    tokens = {}

    # Ensure a mission exists
    mission = db_session.scalar(select(Mission).limit(1))
    if not mission:
        mission = Mission(
            code="TEST-MSN",
            name="Test Mission",
            category="orbital",
            destination="LEO",
            planned_duration_days=30,
            elapsed_duration_days=0,
            phase="active",
            crew_size=3,
            gravity_g=0.0,
            radiation_environment="LEO",
            radiation_dose_rate_msv_day=0.5,
            comm_delay_seconds=2,
            exercise_available=True,
            medical_support="ground",
            environment="station",
            monitoring_profile="standard",
            description="Test mission for incidents",
        )
        db_session.add(mission)
        db_session.flush()

    mission_id = mission.id

    def register_login(email: str, role: str, full_name: str):
        reg = client.post("/api/auth/register", json={
            "email": email, "password": "Cosmicare!2026",
            "full_name": full_name, "role": role,
        })
        assert reg.status_code == 201, f"register {email} failed: {reg.text}"
        login = client.post("/api/auth/login", json={
            "email": email, "password": "Cosmicare!2026",
        })
        assert login.status_code == 200, f"login {email} failed: {login.text}"
        return login.json()["token"]

    tokens["med"] = register_login("medical@test.demo", "medical", "Medical Staff")
    tokens["mc"] = register_login("control@test.demo", "mission_control", "Mission Control")
    tokens["astro"] = register_login("astro@test.demo", "astronaut", "Test Astronaut")

    # Assign users to mission so they have access
    for email in ("medical@test.demo", "control@test.demo", "astro@test.demo"):
        user = db_session.scalar(select(User).where(User.email == email))
        if user:
            existing = db_session.scalar(
                select(MissionAssignment).where(
                    MissionAssignment.mission_id == mission_id,
                    MissionAssignment.user_id == user.id,
                )
            )
            if not existing:
                db_session.add(MissionAssignment(
                    mission_id=mission_id, user_id=user.id,
                    role_on_mission="crew", seat="1",
                ))
    db_session.flush()

    tokens["mission_id"] = mission_id
    return tokens


class TestIncidentLifecycle:
    """Test incident lifecycle operations."""

    def _create_incident(self, client, tokens, role_token_key="mc", **overrides):
        payload = {
            "mission_id": tokens["mission_id"],
            "astronaut_id": 1,
            "severity": "moderate",
            "title": "Test incident",
            "description": "Test incident description",
            "source": "manual",
        }
        payload.update(overrides)
        return client.post(
            "/api/incidents/",
            json=payload,
            headers={"Authorization": f"Bearer {tokens[role_token_key]}"},
        )

    def test_create_incident_mission_control(self, client, auth_tokens):
        """Mission control can create an incident for an assigned mission."""
        response = self._create_incident(client, auth_tokens)
        assert response.status_code == 201
        data = response.json()
        assert data["title"] == "Test incident"
        assert data["status"] == "new"
        assert data["severity"] == "moderate"

    def test_acknowledge_incident_medical(self, client, auth_tokens):
        """Medical staff can acknowledge an incident on an assigned mission."""
        create_response = self._create_incident(client, auth_tokens, title="Ack test")
        assert create_response.status_code == 201
        incident_id = create_response.json()["id"]

        response = client.post(
            f"/api/incidents/{incident_id}/acknowledge",
            headers={"Authorization": f"Bearer {auth_tokens['med']}"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "acknowledged"

    def test_resolve_incident_medical(self, client, auth_tokens):
        """Medical staff can resolve an incident."""
        create_response = self._create_incident(client, auth_tokens, title="Resolve test")
        assert create_response.status_code == 201
        incident_id = create_response.json()["id"]

        response = client.post(
            f"/api/incidents/{incident_id}/resolve",
            json={"status": "resolved", "note": "Issue resolved"},
            headers={"Authorization": f"Bearer {auth_tokens['med']}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "resolved"
        assert data.get("resolved_at") is not None

    def test_astronaut_cannot_acknowledge_incident(self, client, auth_tokens):
        """Astronauts cannot acknowledge incidents (clinical/MC only)."""
        create_response = self._create_incident(client, auth_tokens)
        assert create_response.status_code == 201
        incident_id = create_response.json()["id"]

        response = client.post(
            f"/api/incidents/{incident_id}/acknowledge",
            headers={"Authorization": f"Bearer {auth_tokens['astro']}"},
        )
        assert response.status_code == 403
        assert "Only clinical or Mission Control staff" in response.json()["detail"]

    def test_invalid_status_transition_rejected(self, client, auth_tokens):
        """Invalid status values are rejected by schema/validation."""
        create_response = self._create_incident(client, auth_tokens)
        assert create_response.status_code == 201
        incident_id = create_response.json()["id"]

        response = client.patch(
            f"/api/incidents/{incident_id}",
            json={"status": "invalid_status"},
            headers={"Authorization": f"Bearer {auth_tokens['med']}"},
        )
        assert response.status_code in (400, 422)


class TestRoleBasedAccess:
    """Test role-based access control for incidents."""

    def test_admin_cannot_create_clinical_incidents(self, client, auth_tokens):
        """Admin accounts cannot create clinical incidents."""
        reg = client.post("/api/auth/register", json={
            "email": "admin@test.demo", "password": "Cosmicare!2026",
            "full_name": "Admin User", "role": "admin",
        })
        assert reg.status_code == 201
        login = client.post("/api/auth/login", json={
            "email": "admin@test.demo", "password": "Cosmicare!2026",
        })
        admin_token = login.json()["token"]

        response = client.post(
            "/api/incidents/",
            json={
                "mission_id": auth_tokens["mission_id"],
                "astronaut_id": 1,
                "severity": "moderate",
                "title": "Admin tried incident",
                "description": "Should fail",
                "source": "manual",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 403
        assert "Administrator accounts cannot create clinical incidents" in response.json()["detail"]
