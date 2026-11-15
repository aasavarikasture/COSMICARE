"""Basic missions endpoint tests."""
from __future__ import annotations

import os
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from backend.app.database import Base, SessionLocal, get_db
from backend.app.main import app


@pytest.fixture(scope="session", autouse=True)
def reset_rate_limiter():
    import backend.app.routers.auth as auth_module

    auth_module._attempts.clear()
    auth_module.WINDOW = 3600
    auth_module.MAX_ATTEMPTS = 1000


@pytest.fixture(scope="session")
def db_engine_isolated():
    test_db_url = "sqlite:///./backend/test_cosmicare_rebuild_missions.db"
    engine = create_engine(test_db_url, connect_args={"check_same_thread": False}, pool_pre_ping=True)
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    time.sleep(0.1)
    p = "./backend/test_cosmicare_rebuild_missions.db"
    if os.path.exists(p):
        try:
            os.remove(p)
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


def test_missions_requires_auth(client):
    resp = client.get("/api/missions")
    assert resp.status_code == 401


def test_missions_list_authenticated(client):
    r = client.post(
        "/api/auth/register",
        json={"email": "muser@test.demo", "password": "Cosmicare!2026", "full_name": "M User", "role": "admin", "invite_code": "COSMICARE-DEMO-2026"},
    )
    assert r.status_code == 201
    login = client.post("/api/auth/login", json={"email": "muser@test.demo", "password": "Cosmicare!2026"})
    token = login.json()["token"]
    resp = client.get("/api/missions", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert "missions" in resp.json()
