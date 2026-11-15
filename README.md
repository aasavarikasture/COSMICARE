# COSMICARE

COSMICARE is an existing AI-powered astronaut healthcare and mission-health intelligence platform prototype. It supports role-based workflows for astronauts, medical staff, mission control, and administrators across the mission lifecycle, including health monitoring, wellness assessments, radiation intelligence, predictive/decision-support analysis, incidents, and mission analytics.

> **Important:** This repository contains a development/demo implementation. Many values are simulated, modelled, derived, or predicted for demonstration and decision-support purposes and must not be treated as real clinical measurements or official NASA operational data.

## Project structure

- `backend/` — FastAPI + SQLAlchemy API, auth, simulation/analytics/rules, AI companion/analysis services, report generation, tests.
- `frontend/` — React + TypeScript + Vite UI, role-based dashboards, charts (Recharts), API client.
- `docs/` — audit/repair/provenance documentation.
- `backend/cosmicare_rebuild.db` (and other local DB files) — local SQLite database(s) used in development (do not commit/reset).

## Technology stack

- **Backend:** Python, FastAPI, SQLAlchemy, Pydantic, JWT auth, ReportLab (PDF reports), pytest.
- **Frontend:** React, TypeScript, Vite, React Router, Recharts.
- **Database:** SQLite (local development default).
- **AI/analysis:** grounded/deterministic analysis pipeline with optional LLM provider support and mock/fallback behavior.

## Setup instructions

### Prerequisites

- Python 3.10+ recommended
- Node.js 18+ and npm
- PowerShell (Windows) or a POSIX shell

### Backend setup

```powershell
Set-Location C:\Users\user\Desktop\COSMICARE_REBUILD\backend

# Create/activate virtual environment (if needed)
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Configure environment
Copy-Item .env.example .env -ErrorAction SilentlyContinue
# Edit .env as needed (DATABASE_URL, JWT_SECRET, CORS_ORIGINS, LLM settings)
```

### Frontend setup

```powershell
Set-Location C:\Users\user\Desktop\COSMICARE_REBUILD\frontend
npm install

# Configure environment
Copy-Item .env.example .env -ErrorAction SilentlyContinue
# Ensure VITE_API_BASE_URL matches the backend origin (without /api)
```

## Startup instructions

### Start backend (FastAPI)

```powershell
Set-Location C:\Users\user\Desktop\COSMICARE_REBUILD\backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

- API base: `http://127.0.0.1:8001`
- API routes are served under `/api` (e.g. `http://127.0.0.1:8001/api/health`)
- In development, tables are created and demo data may be auto-seeded **only if the database is empty** (existing records are not reset).

### Start frontend (Vite)

```powershell
Set-Location C:\Users\user\Desktop\COSMICARE_REBUILD\frontend
npm run dev
```

- Default dev URL: `http://localhost:5173`
- Set `VITE_API_BASE_URL` in `frontend/.env` to the backend origin (example: `http://127.0.0.1:8001`). A port mismatch will prevent login/dashboard loading.

## Demo login instructions

Demo users may be present in the existing seeded local database. Common demo accounts (if seeded) include:
- Astronaut: `reyes@cosmicare.demo`
- Medical: `hale@cosmicare.demo`
- Mission Control: `control@cosmicare.demo`
- Admin: `admin@cosmicare.demo`

**Do not expose or commit real credentials.** If passwords are not known in your local environment, use the existing local setup/seed logic or create users through authorized admin/backend workflows as appropriate. Do not reset the database to recover demo credentials.

## Features overview

- **Authentication & role-based access:** JWT auth, session restore, protected routes for Astronaut/Medical/Mission Control/Admin.
- **Astronaut dashboard:** mission context, interactive health-challenge navigation, physical/mental/sleep/bone/muscle/cardiovascular views, Recharts trends, radiation intelligence, predictive health analysis report, private wellness assessments, AI companion.
- **Medical dashboard:** incident management, crew health inspection, mission report generation and PDF access (authorized).
- **Mission Control dashboard:** mission overview, crew monitoring, alerts/incidents, analytics and operational views.
- **Admin dashboard:** user/mission management, audit/system/demo controls (authorized).
- **Radiation intelligence:** modelled exposure records/projections, event/alert context, optional external space-weather context, limitations and data-class labeling.
- **Predictive/AI analysis:** grounded decision-support insights, risks, and recommendations with uncertainty/limitations; not clinical diagnosis.

## Architecture overview

1. **Frontend (React/Vite)** authenticates users, stores JWT token, and calls backend `/api/*` endpoints via `frontend/src/lib/api/client.ts`.
2. **Backend (FastAPI)** validates auth/roles, queries/calculates from SQLAlchemy models/SQLite, and returns structured JSON responses (including data labels/references/statistics where available).
3. **Simulation/analytics/rules** generate simulated telemetry, modelled radiation, derived observations/statistics, and predicted/estimated insights/risks/recommendations.
4. **AI services** provide grounded companion/analysis responses with provider/mock fallback behavior.
5. **UI rendering** presents metrics/charts/reports with source, unit, status, trend, time context, and limitations; it should not display raw internal/debug/code payloads to end users.

## Data sources and scientific responsibility

- **Actual/stored records:** users, missions, assignments, assessments, incidents, audit logs, and other persisted application records in the database.
- **Simulated telemetry:** mission/crew physiological samples generated for demonstration (`source=simulated` where indicated).
- **Modelled radiation:** dose increments/projections based on mission profiles/scenarios and assumptions.
- **Derived/calculated indicators:** baselines, trends/statistics, and health observations computed from available records.
- **Predicted/estimated outputs:** rule/statistical/model-generated insights, risk indicators, and recommendations (decision support with uncertainty).
- **External observed context (optional):** space-weather/provider data when available; unavailable data must be shown as unavailable.
- **Synthetic demonstration data:** seeded/demo records used for development; clearly label as demonstration where applicable.

**Do not present** simulated telemetry as real astronaut measurements, synthetic/demo datasets as official NASA research, or predictions/estimates as clinical diagnoses.

See `docs/DATA_PROVENANCE_REPORT.md` for traced metric provenance.

## Known limitations

- Not all automated tests/builds/browser flows were re-verified in the latest repair pass; see `docs/COMPLETE_REPAIR_REPORT.md`.
- Correct operation requires frontend `VITE_API_BASE_URL` to match the running backend host/port.
- Telemetry/radiation and many analytics outputs are simulated/modelled/derived for demo purposes.
- Predictive/risk outputs are heuristic and uncertain; insufficient historical data limits reliability.
- External integrations (e.g. space weather, LLM providers) may be unavailable depending on environment/network/configuration.
- Some UI areas outside the primary repaired paths may still require additional runtime validation.

## Verification commands

```powershell
# Backend tests (from backend/)
Set-Location C:\Users\user\Desktop\COSMICARE_REBUILD\backend
.\.venv\Scripts\Activate.ps1
pytest

# Frontend checks (from frontend/)
Set-Location C:\Users\user\Desktop\COSMICARE_REBUILD\frontend
npm test
npm run lint
npm run build
```

## GitHub submission notes

- Review all staged files before commit/push.
- Ensure `.env`, secrets, API keys, JWT secrets, virtual environments, `node_modules`, logs, build artifacts, and unintended database files are not committed.
- Use `.env.example` files for configuration templates.
- Do not delete the working local database and do not run destructive git operations.
- Suggested review commands are included in `docs/COMPLETE_REPAIR_REPORT.md`.

## Additional documentation

- `docs/COMPLETE_REPAIR_REPORT.md`
- `docs/DATA_PROVENANCE_REPORT.md`
- Existing audit/readiness docs in `docs/` (review for historical context)


