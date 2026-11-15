# COSMICARE Data Provenance Report

Date: 2026-03 environment inspection (static/code + local DB inspection)  
Scope: Existing COSMICARE_REBUILD project (`backend/`, `frontend/`, `backend/cosmicare_rebuild.db`)

## 1. Database connection verification

- **Connected database (configured):** SQLite via `backend/app/config.py` default `sqlite:///./cosmicare_rebuild.db`, resolved relative to backend and overridden by environment.
- **Observed environment config:** `backend/.env` sets `DATABASE_URL=sqlite:///C:/Users/user/Desktop/COSMICARE_REBUILD/backend/cosmicare_rebuild.db`.
- **Observed DB file:** `backend/cosmicare_rebuild.db` exists and contains expected tables and records.
- **Tables present (inspected):** `users`, `astronaut_profiles`, `missions`, `mission_assignments`, `telemetry_samples`, `health_observations`, `assessments`, `insights`, `risk_snapshots`, `recommendations`, `radiation_daily_records`, `incidents`, `audit_logs`, `chat_conversations`, `chat_messages`, etc.
- **Record counts (inspected):** `users=14`, `missions=4`, `astronaut_profiles=11`, `mission_assignments=18`, `telemetry_snapshots=1251`, `assessments=4`, `radiation_records=1129` (plus incidents/insights/risk/recommendation records as present).
- **Startup behavior:** `backend/app/main.py` creates tables and auto-seeds demo data in development when the DB is empty; it does **not** reset existing records.
- **Conclusion:** The backend is configured for and able to use the existing local SQLite database. Dashboard values depend on successful API calls from the frontend to this backend and on authenticated access to the correct records.

## 2. Data classes used by the application

The application distinguishes (by design/implementation) several data classes:
- **Measured/recorded:** user/mission/assignment/admin records stored in DB; self-reported assessments submitted through the UI/API; incident and audit records.
- **Simulated telemetry:** physiological telemetry samples generated/stored as `TelemetrySample` with `source="simulated"` (mission/crew simulation).
- **Modelled:** radiation daily records/dose projections and some exposure calculations (`RadiationDailyRecord`, forecast/summary logic) derived from mission profiles, scenarios, and configured rates.
- **Derived:** health observations/statistics computed from baselines, telemetry, and mission context (e.g. derived bone/muscle indicators, baseline deviations, trend statistics).
- **Predicted/estimated:** insights, risk snapshots, and recommendations produced by deterministic rules/statistical screening/predictive heuristics (`analytics.py`, `rules.py`, `services/intelligence.py`); confidence/limitations are included in responses where implemented.
- **Observed external context (when available):** space-weather context (e.g. NOAA SWPC Kp) may be fetched for radiation forecast; unavailable external data must be reported as unavailable rather than fabricated.
- **Grounded AI output:** AI companion/analysis responses are generated from application records with fallback/mock behavior when LLM providers are unavailable; responses should be treated as decision support, not diagnoses.

## 3. Key metric provenance traces

### 3.1 Astronaut physical health (dashboard cards/charts)
- **DB records:** `telemetry_samples` (simulated series), `health_observations`, `health_baselines` (via astronaut profile/baselines), `assessments`, `insights`, `risk_snapshots`, `recommendations`.
- **Backend query/calculation:** `GET /api/astronauts/{id}/health` (`backend/app/routers/astronauts.py`) loads latest/series telemetry, baselines, observations, assessments, insights, risks, recommendations; computes `statistics` (trend/slope/samples) and returns `reference_ranges` and `data_labels`.
- **API response:** JSON payload including `latest`, `series`, `statistics`, `reference_ranges`, `data_labels`, `insights`, `risks`, `recommendations`.
- **Frontend component:** `frontend/src/pages/astronaut.tsx` (`AstronautDashboard`) fetches via `api.get('/astronauts/{id}/health')`.
- **Displayed value:** metric cards (HR/BP/SpO₂/temp/HRV/sleep/recovery), Recharts trend charts, bone/muscle observation panels, insights/risks/recommendations.
- **Notes:** status labels use configured reference ranges from response where available; no universal medical thresholds are invented in the repaired UI.

### 3.2 Mental wellness (assessments, trends, companion)
- **DB records:** `assessments` (private self-reports), `chat_conversations`, `chat_messages`.
- **Backend query/calculation:** `POST /api/astronauts/{id}/assessments` persists assessments with authorization checks; `GET /api/astronauts/{id}/health` includes assessments for the authorized astronaut view; AI chat endpoints store/retrieve conversation history and generate grounded replies.
- **API response:** assessment objects and chat responses; health payload includes assessment history/scores.
- **Frontend component:** `AstronautDashboard` assessment form and wellness charts/history; AI companion panel.
- **Displayed value:** mood/stress/sleep-quality/isolation/fatigue trends, assessment history, private chat messages.
- **Privacy:** backend role/profile checks restrict access; Mission Control must not receive unrestricted private astronaut conversations (enforced by endpoint authorization design).

### 3.3 Radiation intelligence
- **DB records:** `radiation_daily_records` (modelled daily increments/events), mission/environment/profile data.
- **Backend query/calculation:** `GET /api/radiation?astronaut_id=...` (`backend/app/routers/radiation.py`) aggregates cumulative/modelled exposure, rate, projections, alerts, data classes; `GET /api/radiation/forecast?mission_id=...` adds scenario/event forecast and observed space-weather context when available.
- **API response:** cumulative dose, dose rate, projected end-of-mission dose, series, alerts, reference/screening context, data classes, forecast fields.
- **Frontend component:** `AstronautDashboard` radiation section.
- **Displayed value:** cumulative/projected metrics, daily/cumulative chart, radiation intelligence report, space-weather context, alerts/events.
- **Notes:** repaired UI labels exposure as modelled unless otherwise indicated and distinguishes measurements/projections/external context/estimates.

### 3.4 Predictive health analysis
- **DB records:** telemetry, observations, assessments, radiation, mission context, prior insights/risks.
- **Backend query/calculation:** `POST /api/ai/analyze/{id}` (`backend/app/routers/ai.py`) runs analysis pipeline via intelligence/analytics/rules to generate signals, insights, risks, recommendations.
- **API response:** structured analysis payload (signals/insights/risks/recommendations, pipeline/metadata as provided).
- **Frontend component:** `AstronautDashboard` predictive analysis report section (formats results into Current Status, Observed Trends, Potential Future Concerns, Prediction, Confidence/Reliability, Recommended Monitoring, Data Limitations, Data Sources).
- **Displayed value:** human-readable report; no raw JSON/code/debug output is intentionally rendered by the repaired component.

### 3.5 Mission Control analytics and crew monitoring
- **DB records:** missions, users/astronaut profiles, assignments, telemetry, assessments, insights, risks, incidents, radiation records.
- **Backend query/calculation:** mission/astronaut/telemetry/radiation/incident/analytics endpoints aggregate authorized operational data.
- **API response:** mission summaries, crew lists, telemetry/risk summaries, alerts/incidents, analytics datasets.
- **Frontend component:** `frontend/src/pages/mission-control.tsx`.
- **Displayed value:** mission overview, crew status, charts, alerts/incidents, analytics. (Operational aggregates must not expose unrestricted private astronaut conversations.)

### 3.6 Medical dashboard
- **DB records:** assigned astronauts/crew records, assessments, incidents, reports/artifacts as supported.
- **Backend query/calculation:** `/api/missions`, `/api/astronauts`, `/api/incidents`, `/api/reports/*` with role-based authorization.
- **API response:** incidents, crew, report generation/download metadata.
- **Frontend component:** `frontend/src/pages/medical.tsx` (repaired in this session).
- **Displayed value:** incident timeline/actions, crew health records, report generation/PDF access and limitations.

### 3.7 Admin dashboard
- **DB records:** users, missions, audit logs, system/demo state.
- **Backend query/calculation:** `/api/admin/*`, audit/system/demo endpoints with admin authorization.
- **API response:** users, missions, audit/system information.
- **Frontend component:** `frontend/src/pages/admin.tsx`.
- **Displayed value:** user/mission management views, audit/system/demo controls as implemented and authorized.

## 4. Issues found during inspection/repair

- **Frontend-backend connectivity risk:** frontend environment examples/local config previously pointed to `http://127.0.0.1:8001`; backend commonly runs on port `8000` unless explicitly started otherwise. This can cause login/dashboard load failures ("Unable to reach..." / unable to load data). Examples were updated and root env example added; actual runtime port must match the started backend.
- **Medical dashboard defects (fixed):** broken JSX/string concatenation and double `/api` prefixes in fetch paths (`/api/api/...`) prevented correct rendering/requests in places; repaired in `frontend/src/pages/medical.tsx`.
- **Astronaut dashboard gaps (addressed in repair):** mission-health challenge sections were not meaningfully interactive; lacked comprehensive charts/clear metric explanations and formatted radiation/predictive reports; repaired in `frontend/src/pages/astronaut.tsx` to use backend series/statistics and present human-readable, source/limitation-aware reports.
- **Raw technical output risk:** predictive/AI responses can include structured data; repaired astronaut UI renders formatted report fields and avoids dumping raw JSON/code. Other pages should be verified in runtime/browser testing.
- **Demonstration/simulated data:** seeded DB and simulation produce demo users, simulated telemetry, modelled radiation, and derived/predicted indicators. These are valid for development/demo but must be clearly labelled and must not be presented as official NASA measurements/research.

## 5. Hardcoded/fallback behavior review

- `frontend/src/lib/api/client.ts` defaults API base URL to `http://127.0.0.1:8001` if `VITE_API_BASE_URL` is unset (updated guidance/examples prefer explicit configuration matching backend). Network failures return structured error messages rather than fabricated data.
- Repaired dashboards prefer backend-returned values/labels and show explicit loading/error/insufficient-data states instead of silently substituting placeholder success values.
- Backend seed/simulation logic creates demo/simulated records by design; this is intentional demonstration data, not hidden fallback for missing production measurements.

## 6. Verification status and limitations

- **Verified by inspection:** DB presence/schema/counts, API/frontend wiring patterns, role-aware endpoints, repaired component source for Medical and Astronaut dashboards, config/env examples/gitignore updates.
- **Not fully verified in this environment/session:** complete pytest suite, frontend tests/lint/build, and browser end-to-end flows for all four roles/interactions. Runtime verification depends on starting backend/frontend with matching ports and credentials.
- **Recommendation:** run backend and frontend locally, confirm `VITE_API_BASE_URL` matches backend origin, execute automated checks, and perform browser validation per `docs/COMPLETE_REPAIR_REPORT.md`.
