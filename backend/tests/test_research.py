"""Research module tests for COSMICARE backend."""
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
    test_db_url = "sqlite:///./backend/test_cosmicare_rebuild_research2.db"
    engine = create_engine(test_db_url, connect_args={"check_same_thread": False}, pool_pre_ping=True)
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    time.sleep(0.1)
    for p in ["./backend/test_cosmicare_rebuild_research2.db", "./backend/test_cosmicare_rebuild_research.db"]:
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


@pytest.fixture
def auth_tokens(client):
    # medical
    r = client.post(
        "/api/auth/register",
        json={"email": "medr@test.demo", "password": "Cosmicare!2026", "full_name": "Med R", "role": "medical"},
    )
    assert r.status_code == 201
    m = client.post("/api/auth/login", json={"email": "medr@test.demo", "password": "Cosmicare!2026"})
    assert m.status_code == 200
    med_token = m.json()["token"]

    # admin
    r = client.post(
        "/api/auth/register",
        json={
            "email": "adminr@test.demo",
            "password": "Cosmicare!2026",
            "full_name": "Admin R",
            "role": "admin",
            "invite_code": "COSMICARE-DEMO-2026",
        },
    )
    assert r.status_code == 201
    a = client.post("/api/auth/login", json={"email": "adminr@test.demo", "password": "Cosmicare!2026"})
    assert a.status_code == 200
    admin_token = a.json()["token"]

    return {"med_token": med_token, "admin_token": admin_token}


class TestResearch:
    def test_get_sources(self, client, auth_tokens):
        resp = client.get("/api/research/sources", headers={"Authorization": f"Bearer {auth_tokens['med_token']}"})
        assert resp.status_code == 200
        assert "sources" in resp.json()

    def test_import_csv_valid(self, client, auth_tokens):
        csv_content = "metric,value,unit\nblood_pressure,120,mmHg\nheart_rate,72,bpm\n"
        files = {"file": ("test.csv", csv_content, "text/csv")}
        data = {"title": "CSV Test", "source": "User-provided", "source_url": "", "license": ""}
        resp = client.post(
            "/api/research/import/csv",
            files=files,
            data=data,
            headers={"Authorization": f"Bearer {auth_tokens['med_token']}"},
        )
        assert resp.status_code in (200, 201)
        body = resp.json()
        assert "record_count" in body

    def test_import_csv_empty_fails(self, client, auth_tokens):
        files = {"file": ("empty.csv", "", "text/csv")}
        data = {"title": "Empty CSV", "source": "User", "source_url": "", "license": ""}
        resp = client.post(
            "/api/research/import/csv",
            files=files,
            data=data,
            headers={"Authorization": f"Bearer {auth_tokens['med_token']}"},
        )
        assert resp.status_code in (400, 422, 413)

    def test_unauthorized_cannot_list_sources(self, client):
        resp = client.get("/api/research/sources")
        assert resp.status_code == 401