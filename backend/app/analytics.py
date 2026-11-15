"""Layer 2/3 — statistical analysis and predictive estimates.

Uses NumPy, pandas and scikit-learn where the available simulated data actually
supports a model. Every output carries an explicit data class and limitations.
No claim of clinical validation is made.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LinearRegression

FEATURES = ["heart_rate", "spo2", "sleep_hours", "hrv"]
FEATURE_LABELS = {
    "heart_rate": "heart rate",
    "spo2": "oxygen saturation",
    "sleep_hours": "sleep duration",
    "hrv": "heart rate variability",
}


def _arr(rows, attr: str) -> np.ndarray:
    return np.array([float(getattr(r, attr, 0) or 0) for r in rows], dtype=float)


def _slope_per_day(times: list[datetime], values: np.ndarray) -> tuple[float, float, float]:
    """Least-squares slope with residual standard error. Returns (slope, r2, se)."""
    if len(values) < 3:
        return 0.0, 0.0, 0.0
    x = np.array([(t - times[0]).total_seconds() / 86400.0 for t in times])
    if np.allclose(x, x[0]):
        return 0.0, 0.0, 0.0
    model = LinearRegression().fit(x.reshape(-1, 1), values)
    pred = model.predict(x.reshape(-1, 1))
    ss_res = float(np.sum((values - pred) ** 2))
    ss_tot = float(np.sum((values - values.mean()) ** 2)) or 1e-9
    r2 = max(0.0, 1 - ss_res / ss_tot)
    dof = max(1, len(values) - 2)
    se = float(np.sqrt(ss_res / dof))
    return float(model.coef_[0]), r2, se


def detect_anomalies(snapshots: list) -> dict:
    """Multivariate anomaly detection on recent samples.

    IsolationForest is used only as a statistical screen over the simulated
    window; it is not a diagnostic model and is not trained on patient outcomes.
    """
    rows = [s for s in snapshots if s.sensor_status == "nominal"][-60:]
    if len(rows) < 12:
        return {"available": False, "reason": "Insufficient clean samples for multivariate screening."}
    X = np.column_stack([_arr(rows, f) for f in FEATURES])
    # Guard against zero-variance columns producing misleading scores.
    std = X.std(axis=0)
    keep = std > 1e-6
    if keep.sum() < 2:
        return {"available": False, "reason": "Insufficient signal variance in window."}
    Xk = X[:, keep]
    model = IsolationForest(n_estimators=120, contamination="auto", random_state=42)
    labels = model.fit_predict(Xk)
    scores = model.decision_function(Xk)
    recent_idx = len(rows) - 1
    recent_score = float(scores[recent_idx])
    flagged = int((labels == -1).sum())
    return {
        "available": True,
        "method": "IsolationForest (scikit-learn), 120 estimators, fit on this astronaut's last "
        f"{len(rows)} clean simulated samples",
        "anomaly_count": flagged,
        "window_size": len(rows),
        "latest_anomaly_score": round(recent_score, 4),
        "latest_is_anomalous": bool(labels[recent_idx] == -1),
        "feature_set": [f for f, k in zip(FEATURES, keep) if k],
        "limitation": "Unsupervised screen on simulated data; flagging is not a clinical finding.",
    }


def describe_series(snapshots: list, attr: str) -> dict:
    rows = [s for s in snapshots if getattr(s, attr, 0)]
    if not rows:
        return {"available": False}
    values = _arr(rows, attr)
    times = [s.recorded_at for s in rows]
    slope, r2, se = _slope_per_day(times, values)
    return {
        "available": True,
        "latest": round(float(values[-1]), 2),
        "mean": round(float(values.mean()), 2),
        "min": round(float(values.min()), 2),
        "max": round(float(values.max()), 2),
        "samples": len(values),
        "slope_per_day": round(slope, 3),
        "r2": round(r2, 3),
        "residual_se": round(se, 3),
        "latest_z": round(float((values[-1] - values.mean()) / (values.std() or 1e-9)), 2),
    }


def correlations(snapshots: list) -> list[dict]:
    rows = snapshots[-120:]
    if len(rows) < 10:
        return []
    pairs = [
        ("sleep_hours", "recovery_score", "sleep vs recovery"),
        ("sleep_hours", "hrv", "sleep vs HRV"),
        ("exercise_minutes", "hrv", "exercise load vs HRV"),
        ("heart_rate", "sleep_quality", "heart rate vs sleep quality"),
    ]
    out = []
    for a, b, label in pairs:
        x, y = _arr(rows, a), _arr(rows, b)
        if x.std() < 1e-6 or y.std() < 1e-6:
            continue
        r = float(np.corrcoef(x, y)[0, 1])
        out.append(
            {
                "pair": label,
                "r": round(r, 2),
                "n": len(rows),
                "strength": "strong" if abs(r) >= 0.6 else "moderate" if abs(r) >= 0.3 else "weak",
                "note": "Correlation in simulated data; not causal evidence.",
            }
        )
    return out


def build_insights(
    *,
    astronaut,
    mission,
    snapshots: list,
    observations: list,
    baselines: dict,
    radiation_daily: list,
) -> list[dict]:
    """Layer 2/3 insight payloads (persisted by the service layer)."""
    insights: list[dict] = []
    if len(snapshots) >= 12:
        anomaly = detect_anomalies(snapshots)
        if anomaly.get("available") and anomaly["latest_is_anomalous"] and anomaly["latest_anomaly_score"] < -0.02:
            insights.append(
                {
                    "kind": "trend",
                    "domain": "multivariate",
                    "severity": "low",
                    "title": "Multivariate pattern flagged by statistical screen",
                    "summary": (
                        f"The latest simulated sample sits outside this astronaut's usual pattern "
                        f"(score {anomaly['latest_anomaly_score']})."
                    ),
                    "explanation": {
                        "what": "An unsupervised anomaly screen flagged the most recent sample.",
                        "indicators": [{"name": f, "value": "included", "unit": ""} for f in anomaly["feature_set"]],
                        "window": f"{anomaly['window_size']} recent simulated samples",
                        "why": "Combinations of mild deviations can be more informative than any single value.",
                        "data_class": "derived",
                        "action": "Review the contributing signals and repeat measurements before drawing conclusions.",
                        "evidence": [anomaly["method"]],
                        "limitation": anomaly["limitation"],
                    },
                    "confidence": 0.55,
                    "data_class": "derived",
                }
            )

    sleep = describe_series(snapshots, "sleep_hours")
    if sleep.get("available") and sleep["slope_per_day"] < -0.01 and sleep["r2"] > 0.15:
        projected = sleep["latest"] + sleep["slope_per_day"] * 14
        insights.append(
            {
                "kind": "prediction",
                "domain": "sleep",
                "severity": "low",
                "title": "Sleep duration trend projects downward",
                "summary": (
                    f"Linear trend projects about {max(3.5, projected):.1f} h average sleep in 14 days "
                    f"(95% band ±{1.96 * sleep['residual_se']:.1f} h)."
                ),
                "explanation": {
                    "what": "Recent simulated sleep duration is trending down.",
                    "indicators": [
                        {"name": "sleep trend", "value": sleep["slope_per_day"], "unit": "h/day"},
                        {"name": "model fit (r²)", "value": sleep["r2"], "unit": ""},
                    ],
                    "window": f"{sleep['samples']} simulated sleep periods",
                    "why": "Earlier intervention on a downward sleep trend is easier than reversing chronic restriction.",
                    "data_class": "predicted",
                    "action": "Protect sleep opportunity and review light, scheduling and workload factors.",
                    "evidence": ["Linear least-squares projection over simulated data with residual-based uncertainty."],
                    "limitation": "A linear projection is not a clinical forecast; it assumes the recent trend continues.",
                },
                "confidence": 0.5,
                "data_class": "predicted",
            }
        )

    hr = describe_series(snapshots, "heart_rate")
    baseline_hr = baselines.get("heart_rate")
    if hr.get("available") and baseline_hr and hr["slope_per_day"] > 0.03 and hr["r2"] > 0.2:
        insights.append(
            {
                "kind": "prediction",
                "domain": "cardiovascular",
                "severity": "low",
                "title": "Heart rate trending upward over the mission window",
                "summary": (
                    f"Estimated trend +{hr['slope_per_day']:.2f} bpm/day; a 30-day projection is "
                    f"{hr['latest'] + hr['slope_per_day'] * 30:.0f} bpm (±{1.96 * hr['residual_se'] * 5.5:.0f})."
                ),
                "explanation": {
                    "what": "A positive heart-rate trend was estimated from simulated samples.",
                    "indicators": [
                        {"name": "heart rate trend", "value": hr["slope_per_day"], "unit": "bpm/day"},
                        {"name": "baseline", "value": baseline_hr, "unit": "bpm"},
                    ],
                    "window": f"{hr['samples']} simulated samples",
                    "why": "Deconditioning, sleep debt and fluid shifts can all raise resting heart rate.",
                    "data_class": "predicted",
                    "action": "Review exercise and sleep countermeasures; discuss persistent trends with medical personnel.",
                    "evidence": ["Linear least-squares projection with residual-based uncertainty."],
                    "limitation": "Wide uncertainty; not a diagnosis of deconditioning.",
                },
                "confidence": 0.45,
                "data_class": "predicted",
            }
        )

    bone_obs = [o for o in observations if o.metric == "bone_density"]
    if len(bone_obs) >= 2:
        first, last = bone_obs[0], bone_obs[-1]
        days = max(1.0, (last.recorded_at - first.recorded_at).total_seconds() / 86400.0)
        rate = (last.value - first.value) / days
        projected = last.value + rate * min(180, max(0, mission.planned_duration_days - mission.elapsed_duration_days))
        insights.append(
            {
                "kind": "prediction",
                "domain": "bone",
                "severity": "moderate" if rate < -0.0015 else "low",
                "title": "Bone mineral density trajectory estimate",
                "summary": (
                    f"Derived bone density is changing at {rate * 30:.3f} g/cm² per 30 days; "
                    f"end-of-mission estimate ≈ {projected:.3f} g/cm²."
                ),
                "explanation": {
                    "what": "Bone density trajectory estimated from derived model observations.",
                    "indicators": [{"name": "rate per 30 days", "value": round(rate * 30, 4), "unit": "g/cm²"}],
                    "window": f"{days:.0f} mission days",
                    "why": "Loss accumulates with unloading and is only partially reversible after return.",
                    "data_class": "predicted",
                    "action": "Maintain resistive exercise and review nutrition with medical personnel.",
                    "evidence": [
                        "COSMICARE unloading model.",
                        "Estimate is not a DXA measurement and has not been validated against real crew data.",
                    ],
                    "limitation": "Model-based extrapolation; uncertainty grows with horizon.",
                },
                "confidence": 0.4,
                "data_class": "predicted",
            }
        )

    total_dose = sum(r.dose_increment_msv for r in radiation_daily)
    rate = mission.radiation_dose_rate_msv_day
    remaining = max(0, mission.planned_duration_days - mission.elapsed_duration_days)
    insights.append(
        {
            "kind": "prediction",
            "domain": "radiation",
            "severity": "moderate" if total_dose + rate * remaining >= 500 else "low",
            "title": "Projected mission radiation exposure",
            "summary": (
                f"Modelled cumulative dose {total_dose:.1f} mSv; projected end-of-mission "
                f"≈ {total_dose + rate * remaining:.0f} mSv at the profile dose rate of {rate:.2f} mSv/day."
            ),
            "explanation": {
                "what": "Projection assumes the configured environment dose rate continues unchanged.",
                "indicators": [
                    {"name": "cumulative dose", "value": round(total_dose, 1), "unit": "mSv"},
                    {"name": "remaining days", "value": remaining, "unit": "d"},
                ],
                "window": "mission-to-date",
                "why": "Mission design and shielding decisions depend on cumulative exposure, not single readings.",
                "data_class": "predicted",
                "action": "Review with the radiation officer; solar events can change this estimate abruptly.",
                "evidence": [
                    "Illustrative environment dose rates (NASA HRP radiation literature).",
                    "Projection excludes solar particle events unless configured in the scenario.",
                ],
                "limitation": "Not an operational dose record; no medical limit is asserted.",
            },
            "confidence": 0.5,
            "data_class": "predicted",
        }
    )

    return insights


def risk_scores(
    *,
    mission,
    snapshots: list,
    baselines: dict,
    observations: list,
    radiation_daily: list,
    signals: list,
) -> list[dict]:
    """Layer 3 — transparent, weighted risk indicators (0-100)."""
    weights = (mission.monitoring_profile or {}).get("weights", {})
    scores: list[dict] = []

    def clamp(x: float) -> float:
        return round(max(0.0, min(100.0, x)), 1)

    severity_weights = {"info": 0, "low": 3, "moderate": 9, "high": 20, "critical": 32}
    domains = ["cardiovascular", "radiation", "bone", "muscle", "mental", "sleep"]
    for domain in domains:
        related = [s for s in signals if s.domain == domain or (domain == "mental" and s.domain == "mental_health")]
        base = sum(severity_weights.get(s.severity, 0) for s in related)
        w = float(weights.get(domain, 0.5))

        if domain == "sleep" and snapshots:
            recent = [s.sleep_hours for s in snapshots[-9:]]
            if recent:
                avg = sum(recent) / len(recent)
                base += max(0.0, (7.0 - avg) * 9)
        if domain == "radiation":
            total = sum(r.dose_increment_msv for r in radiation_daily)
            base += min(30.0, total / 20.0)
        if domain == "bone" and baselines.get("bone_density"):
            bone = [o for o in observations if o.metric == "bone_density"]
            if bone:
                loss = (bone[-1].value - baselines["bone_density"]) / baselines["bone_density"] * 100
                base += min(28.0, abs(min(0.0, loss)) * 5.5)
        if domain == "muscle" and baselines.get("grip_strength"):
            grip = [o for o in observations if o.metric == "grip_strength"]
            if grip:
                loss = (grip[-1].value - baselines["grip_strength"]) / baselines["grip_strength"] * 100
                base += min(25.0, abs(min(0.0, loss)) * 5.0)
        if domain == "mental":
            mental = [s for s in signals if s.domain == "mental_health"]
            base += sum(severity_weights.get(s.severity, 0) * 0.8 for s in mental)

        score = clamp(base * (0.6 + 0.4 * w) + (w - 0.5) * 6)
        drivers = [s.title for s in related][:4]
        scores.append(
            {
                "domain": domain,
                "score": score,
                "weight": w,
                "confidence": 0.55 if domain in ("mental", "bone", "muscle") else 0.65,
                "horizon_days": 30,
                "rationale": {
                    "drivers": drivers or ["No rule-level concerns in this domain."],
                    "method": "Transparent weighted aggregation of deterministic rule signals, baseline deviation and mission-profile weights.",
                    "data_class": "derived",
                    "limitation": "Heuristic index, not a validated clinical risk score.",
                },
            }
        )
    return scores
