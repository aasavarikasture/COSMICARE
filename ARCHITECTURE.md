# ARCHITECTURE (Stage 0)

## Layers

- Frontend (`frontend/`): React + TypeScript, centralized API client (`src/lib/api/client.ts`), env-driven base URL.
- API (`backend/app/main.py`, `backend/app/routers/`): FastAPI, CORS, health, auth.
- Business logic: to be added in later stages.
- Data (`backend/app/models.py`, `backend/app/database.py`): SQLAlchemy models, SQLite dev / PostgreSQL prod.

## Connectivity

- API base URL: `VITE_API_BASE_URL` (default `http://127.0.0.1:8001`).
- Backend health: `GET /api/health`.
- All frontend requests go through the single `request()` helper.
