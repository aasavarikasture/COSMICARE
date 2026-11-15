"""COSMICARE API — Intelligent Care for the Final Frontier."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from .config import settings
from .database import SessionLocal, engine
from .routers import (
    admin,
    ai,
    analytics,
    astronauts,
    auth,
    demo,
    incidents,
    messages,
    missions,
    monitoring,
    radiation,
    research,
)
from .seed import seed_if_empty

logger = logging.getLogger("cosmicare")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.environment != "development":
        weak = settings.jwt_secret in ("", "dev-only-change-me", "change-me-to-a-long-random-string") or len(settings.jwt_secret) < 32
        if weak:
            raise RuntimeError("JWT_SECRET must be set to a strong (>=32 char) value outside development")
        if "*" in settings.cors_origins or not settings.cors_origin_list:
            raise RuntimeError("CORS_ORIGINS must be explicitly configured outside development")
    if settings.auto_seed:
        try:
            seed_if_empty()
            logger.info("Demo data ready")
        except Exception:  # pragma: no cover - startup diagnostics
            logger.exception("Seeding failed")
    yield


app = FastAPI(
    title="COSMICARE API",
    description=(
        "Astronaut health monitoring and mission intelligence platform. "
        "All physiological telemetry is simulated; AI output is decision support, not diagnosis. "
        "NASA does not endorse this project."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(missions.router)
app.include_router(astronauts.router)
app.include_router(monitoring.router)
app.include_router(ai.router)
app.include_router(radiation.router)
app.include_router(incidents.router)
app.include_router(messages.router)
app.include_router(research.router)
app.include_router(analytics.router)
app.include_router(admin.router)
app.include_router(demo.router)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.exception_handler(Exception)
async def unhandled_exception(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. The demo safety engine continues to run locally."},
    )


@app.get("/api/health")
def health():
    db_ok = True
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
    return {
        "status": "ok" if db_ok else "degraded",
        "app": "COSMICARE",
        "database": db_ok,
        "ai_provider": "mock" if (settings.llm_mock or not settings.llm_api_key) else settings.llm_provider,
        "time": datetime.now(timezone.utc).isoformat(),
        "disclaimer": "Simulated data only. Not medical advice.",
    }


@app.get("/")
def root():
    return {
        "name": "COSMICARE API — Intelligent Care for the Final Frontier",
        "docs": "/docs",
        "health": "/api/health",
        "note": "All telemetry is simulated. NASA does not endorse this project.",
    }
