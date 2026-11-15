"""Layer 1 — deterministic, testable safety and rule engine.

Works with no LLM and no network. Thresholds are configurable reference bands
(see reference.py) and are NOT presented as NASA-approved clinical limits.

Outputs structured "signals" that the persistence layer turns into AIInsight
rows and, for critical findings, emergency incidents with immediate protocol
guidance.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from .reference import REFERENCE_RANGES, SEVERITY_RANK

# Immediate, LLM-independent guidance. Human medical authority always applies.
EMERGENCY_PROTOCOLS = {
    "hypoxia": [
        "Verify sensor placement and obtain a second SpO2 reading if possible.",
        "Follow the mission respiratory/oxygen contingency checklist immediately.",
        "Notify the flight surgeon / medical officer and Mission Control now — do not wait for AI analysis.",
    ],
    "cardiovascular": [
        "Sit or lie down, avoid sudden standing, and repeat the reading after 5 minutes.",
        "Initiate the mission cardiovascular contingency checklist and notify medical personnel.",
        "If symptoms (chest pain, syncope, severe breathlessness) are present, treat as a medical emergency.",
    ],
    "infection": [
        "Isolate from other crew where feasible and use the mission illness protocol.",
        "Notify medical personnel for evaluation; record temperature trend.",
    ],
    "radiation": [
        "Move to the designated shielded area following the mission radiation shelter protocol.",
        "Record the exposure event and notify the flight surgeon and radiation officer.",
        "Do not rely on this application for operational dose decisions.",
    ],
    "mental_health": [
        "You are not alone. Contact the assigned flight surgeon or crew medical officer now.",
        "Use the mission emergency communication channel; support is available immediately.",
        "If there is immediate risk of harm, follow the mission emergency medical protocol and alert the crew.",
    ],
}


@dataclass
class Signal:
    kind: str
    domain: str
    severity: str
    title: str
    summary: str
    explanation: dict = field(default_factory=dict)
    confidence: float = 0.7
    data_class: str = "derived"
    escalate_incident: bool = False
    protocol: str | None = None


def _fmt(value: float | None, unit: str = "") -> str:
    if value is None:
        return "n/a"
    return f"{value:g}{(' ' + unit) if unit else ''}"


def _m(mission) -> dict:
    profile = mission.monitoring_profile or {}
    return {
        "weights": profile.get("weights", {}),
        "focus": profile.get("focus", []),
        "mult": float(profile.get("thresholds_multiplier", 1.0)),
    }


def _band(metric: str, multiplier: float = 1.0) -> tuple[float, float, str, str]:
    ref = REFERENCE_RANGES[metric]
    low, high = float(ref["low"]), float(ref["high"])
    # Tighter monitoring bands for higher-risk mission profiles.
    if multiplier < 1.0:
        low = low + (high - low) * (1 - multiplier) * 0.15
        high = high - (high - low) * (1 - multiplier) * 0.15
    return low, high, ref["unit"], ref["source"]


def _signal(
    *,
    domain: str,
    severity: str,
    title: str,
    summary: str,
    indicators: list[dict],
    window: str,
    why: str,
    action: str,
    data_class: str,
    evidence: list[str],
    confidence: float = 0.8,
    escalate_incident: bool = False,
    protocol: str | None = None,
) -> Signal:
    return Signal(
        kind="rule",
        domain=domain,
        severity=severity,
        title=title,
        summary=summary,
        explanation={
            "what": summary,
            "indicators": indicators,
            "window": window,
            "why": why,
            "data_class": data_class,
            "action": action,
            "evidence": evidence,
            "role": "Deterministic safety rule — not a diagnosis.",
        },
        confidence=confidence,
        data_class=data_class,
        escalate_incident=escalate_incident,
        protocol=protocol,
    )


def evaluate_snapshot(snapshot, mission) -> list[Signal]:
    """Run threshold rules on a single telemetry sample."""
    cfg = _m(mission)
    mult = cfg["mult"]
    signals: list[Signal] = []
    if snapshot is None:
        return signals

    if snapshot.sensor_status != "nominal":
        signals.append(
            _signal(
                domain="data_quality",
                severity="low",
                title="Telemetry sensor quality degraded",
                summary="A simulated sensor reported an intermittent signal. Values may be unreliable.",
                indicators=[{"name": "sensor_status", "value": snapshot.sensor_status, "unit": ""}],
                window="latest sample",
                why="Unreliable data must not silently drive clinical conclusions.",
                action="Repeat measurement or use manual assessment until the signal is stable.",
                data_class="simulated",
                evidence=["Measurement quality metadata (simulated sensor)."],
                confidence=0.9,
            )
        )

    hr_low, hr_high, hr_unit, hr_src = _band("heart_rate", mult)
    hr = snapshot.heart_rate
    if hr and hr >= hr_high + 20:
        signals.append(
            _signal(
                domain="cardiovascular",
                severity="high",
                title="Marked tachycardia in latest sample",
                summary=f"Heart rate {_fmt(hr, hr_unit)} is well above the operational reference band ({hr_low:g}-{hr_high:g} {hr_unit}).",
                indicators=[{"name": "heart_rate", "value": hr, "unit": hr_unit, "reference": f"{hr_low:g}-{hr_high:g}"}],
                window="latest sample",
                why="Sustained high heart rate can accompany stress, dehydration, fever or arrhythmia and warrants review.",
                action="Repeat after 5 minutes of rest, review blood pressure and temperature, and notify medical personnel if persistent.",
                data_class="simulated",
                evidence=[hr_src],
                escalate_incident=True,
                protocol="cardiovascular",
            )
        )
    elif hr and hr > hr_high:
        signals.append(
            _signal(
                domain="cardiovascular",
                severity="moderate",
                title="Elevated resting heart rate",
                summary=f"Heart rate {_fmt(hr, hr_unit)} exceeds the {hr_high:g} {hr_unit} reference band.",
                indicators=[{"name": "heart_rate", "value": hr, "unit": hr_unit, "reference": f"{hr_low:g}-{hr_high:g}"}],
                window="latest sample",
                why="A marginal elevation is common with poor sleep, fluid shifts or exertion; a persistent trend matters more than one sample.",
                action="Recheck at rest and compare with the personal baseline and sleep record.",
                data_class="simulated",
                evidence=[hr_src],
            )
        )
    if hr and hr < hr_low - 8 and hr > 0:
        signals.append(
            _signal(
                domain="cardiovascular",
                severity="moderate",
                title="Bradycardia below reference band",
                summary=f"Heart rate {_fmt(hr, hr_unit)} is below the {hr_low:g} {hr_unit} lower reference bound.",
                indicators=[{"name": "heart_rate", "value": hr, "unit": hr_unit, "reference": f"{hr_low:g}-{hr_high:g}"}],
                window="latest sample",
                why="Low resting rates occur in fit crew, but a sudden drop with symptoms is concerning.",
                action="Check for dizziness or syncope and notify medical personnel if symptomatic.",
                data_class="simulated",
                evidence=[hr_src],
            )
        )

    s_low, s_high, s_unit, s_src = _band("systolic", mult)
    d_low, d_high, _, _ = _band("diastolic", mult)
    sbp, dbp = snapshot.systolic, snapshot.diastolic
    if sbp and (sbp >= s_high + 25 or sbp <= s_low - 10 or (dbp and dbp >= d_high + 15)):
        signals.append(
            _signal(
                domain="cardiovascular",
                severity="high",
                title="Blood pressure outside safe operational band",
                summary=f"Blood pressure {_fmt(sbp)}/{_fmt(dbp)} mmHg is outside the reference band ({s_low:g}-{s_high:g} systolic).",
                indicators=[
                    {"name": "systolic", "value": sbp, "unit": "mmHg", "reference": f"{s_low:g}-{s_high:g}"},
                    {"name": "diastolic", "value": dbp, "unit": "mmHg", "reference": f"{d_low:g}-{d_high:g}"},
                ],
                window="latest sample",
                why="Marked hypo- or hypertension after fluid shifts can precede orthostatic intolerance.",
                action="Repeat seated and standing; follow the mission cardiovascular checklist and contact medical personnel.",
                data_class="simulated",
                evidence=[s_src],
                escalate_incident=True,
                protocol="cardiovascular",
            )
        )
    elif sbp and (sbp > s_high or sbp < s_low):
        signals.append(
            _signal(
                domain="cardiovascular",
                severity="moderate",
                title="Borderline blood pressure",
                summary=f"Blood pressure {_fmt(sbp)}/{_fmt(dbp)} mmHg is at the edge of the reference band.",
                indicators=[{"name": "systolic", "value": sbp, "unit": "mmHg"}],
                window="latest sample",
                why="Small deviations are often benign but contribute to orthostatic risk when combined with reduced plasma volume.",
                action="Hydrate, avoid rapid standing, and re-measure after 10 minutes.",
                data_class="simulated",
                evidence=[s_src],
            )
        )

    o_low, o_high, o_unit, o_src = _band("spo2", mult)
    spo2 = snapshot.spo2
    if spo2 and spo2 < o_low - 4:
        signals.append(
            _signal(
                domain="respiratory",
                severity="critical",
                title="Significant oxygen desaturation",
                summary=f"SpO2 {_fmt(spo2, o_unit)} is below the concerning threshold.",
                indicators=[{"name": "spo2", "value": spo2, "unit": o_unit, "reference": f"≥{o_low:g}"}],
                window="latest sample",
                why="Sustained desaturation may indicate hypoxia, sensor error or a cabin atmosphere problem. Treat as urgent until disproven.",
                action="Apply the mission oxygen contingency protocol; verify with a second sensor and alert medical personnel immediately.",
                data_class="simulated",
                evidence=[o_src],
                confidence=0.9,
                escalate_incident=True,
                protocol="hypoxia",
            )
        )
    elif spo2 and spo2 < o_low:
        signals.append(
            _signal(
                domain="respiratory",
                severity="moderate",
                title="Mild oxygen desaturation",
                summary=f"SpO2 {_fmt(spo2, o_unit)} is just below the reference lower bound.",
                indicators=[{"name": "spo2", "value": spo2, "unit": o_unit}],
                window="latest sample",
                why="Small dips can be sensor artefact, but should be confirmed.",
                action="Check sensor placement, repeat the reading, and monitor respiratory rate.",
                data_class="simulated",
                evidence=[o_src],
            )
        )

    r_low, r_high, r_unit, r_src = _band("resp_rate", mult)
    rr = snapshot.resp_rate
    if rr and (rr > r_high + 6 or rr < r_low - 3):
        signals.append(
            _signal(
                domain="respiratory",
                severity="high",
                title="Abnormal respiratory rate",
                summary=f"Respiratory rate {_fmt(rr, r_unit)} is outside the reference band ({r_low:g}-{r_high:g}).",
                indicators=[{"name": "resp_rate", "value": rr, "unit": r_unit}],
                window="latest sample",
                why="Respiratory rate is an early, sensitive marker of physiological deterioration.",
                action="Repeat measurement and assess for breathlessness, fever or anxiety; notify medical personnel if persistent.",
                data_class="simulated",
                evidence=[r_src],
            )
        )

    t_low, t_high, t_unit, t_src = _band("body_temp", mult)
    temp = snapshot.body_temp
    if temp and temp >= t_high + 0.8:
        signals.append(
            _signal(
                domain="immune",
                severity="high",
                title="Febrile temperature reading",
                summary=f"Temperature {_fmt(temp, t_unit)} suggests fever in the simulated dataset.",
                indicators=[{"name": "body_temp", "value": temp, "unit": t_unit, "reference": f"{t_low:g}-{t_high:g}"}],
                window="latest sample",
                why="Fever in a closed environment can indicate infection, which spreads quickly and is hard to treat far from Earth.",
                action="Isolate where feasible, follow the mission illness protocol and notify medical personnel.",
                data_class="simulated",
                evidence=[t_src],
                escalate_incident=True,
                protocol="infection",
            )
        )

    return signals


def evaluate_context(
    *,
    mission,
    snapshots: list,
    baselines: dict[str, float],
    observations: list,
    radiation_daily: list,
    assessments: list,
) -> list[Signal]:
    """Cross-sample rules: sleep, trends, bone/muscle, radiation, mental wellbeing."""
    cfg = _m(mission)
    mult = cfg["mult"]
    signals: list[Signal] = []

    recent = snapshots[-28:]
    if not recent:
        return signals

    # --- sleep ---
    sleep_vals = [s.sleep_hours for s in recent[-9:] if s.sleep_hours]
    if sleep_vals:
        avg_sleep = sum(sleep_vals) / len(sleep_vals)
        if avg_sleep < 5.0:
            signals.append(
                _signal(
                    domain="sleep",
                    severity="moderate",
                    title="Sustained sleep restriction",
                    summary=f"Average sleep over the recent window is {avg_sleep:.1f} h (reference ≥6 h).",
                    indicators=[{"name": "sleep_hours (mean)", "value": round(avg_sleep, 2), "unit": "h"}],
                    window=f"last {len(sleep_vals)} simulated sleep periods",
                    why="Chronic sleep restriction degrades attention, immune function and recovery; it is a key deep-space risk.",
                    action="Protect a 7.5-8 h sleep opportunity, reduce late light exposure, and review the sleep recommendation plan.",
                    data_class="simulated",
                    evidence=[
                        "National Sleep Foundation adult sleep duration guidance (7-9 h).",
                        "NASA HRP behavioural health and performance evidence base (sleep as a countermeasure target).",
                    ],
                )
            )
        elif avg_sleep < 6.0:
            signals.append(
                _signal(
                    domain="sleep",
                    severity="low",
                    title="Below-target sleep duration",
                    summary=f"Average sleep is {avg_sleep:.1f} h over the recent window.",
                    indicators=[{"name": "sleep_hours (mean)", "value": round(avg_sleep, 2), "unit": "h"}],
                    window=f"last {len(sleep_vals)} simulated sleep periods",
                    why="Mild but persistent restriction accumulates into cognitive fatigue.",
                    action="Try a consistent sleep schedule and a short pre-sleep wind-down routine.",
                    data_class="simulated",
                    evidence=["National Sleep Foundation adult sleep duration guidance."],
                )
            )

    # --- heart-rate trend vs personal baseline ---
    hr_vals = [s.heart_rate for s in recent[-12:] if s.heart_rate]
    base_hr = baselines.get("heart_rate")
    if hr_vals and base_hr:
        mean_hr = sum(hr_vals) / len(hr_vals)
        delta = mean_hr - base_hr
        if delta >= 12:
            signals.append(
                _signal(
                    domain="cardiovascular",
                    severity="moderate",
                    title="Heart rate trending above personal baseline",
                    summary=f"Recent mean heart rate is {delta:+.1f} bpm relative to the pre-flight baseline of {base_hr:.0f} bpm.",
                    indicators=[
                        {"name": "heart_rate (recent mean)", "value": round(mean_hr, 1), "unit": "bpm"},
                        {"name": "heart_rate (pre-flight baseline)", "value": base_hr, "unit": "bpm"},
                    ],
                    window=f"last {len(hr_vals)} simulated samples",
                    why="Personal-baseline deviation is more informative than population bands for a given astronaut.",
                    action="Review hydration, sleep and exercise load; notify medical personnel if the trend continues.",
                    data_class="derived",
                    evidence=["COSMICARE baseline-deviation rule (configurable)."],
                )
            )

    # --- HRV decline ---
    hrv_vals = [s.hrv for s in recent[-12:] if s.hrv]
    base_hrv = baselines.get("hrv")
    if hrv_vals and base_hrv:
        mean_hrv = sum(hrv_vals) / len(hrv_vals)
        pct = (mean_hrv - base_hrv) / base_hrv * 100
        if pct <= -30:
            signals.append(
                _signal(
                    domain="recovery",
                    severity="moderate",
                    title="Recovery signal suppressed (HRV below baseline)",
                    summary=f"Recent HRV is {pct:.0f}% below the personal baseline.",
                    indicators=[
                        {"name": "hrv (recent mean)", "value": round(mean_hrv, 1), "unit": "ms"},
                        {"name": "hrv change", "value": round(pct, 1), "unit": "%"},
                    ],
                    window=f"last {len(hrv_vals)} simulated samples",
                    why="A sustained HRV drop can reflect insufficient recovery, illness or high stress load.",
                    action="Reduce training intensity for 24-48 h, prioritise sleep and hydration, and reassess.",
                    data_class="derived",
                    evidence=["HRV is highly individual; comparison is against this astronaut's own baseline."],
                )
            )

    # --- bone density ---
    base_bone = baselines.get("bone_density")
    bone_obs = [o for o in observations if o.metric == "bone_density"]
    if base_bone and bone_obs:
        latest_bone = bone_obs[-1].value
        loss_pct = (latest_bone - base_bone) / base_bone * 100
        if loss_pct <= -4:
            signals.append(
                _signal(
                    domain="bone",
                    severity="high",
                    title="Substantial bone mineral density decline",
                    summary=f"Derived bone density is {loss_pct:.1f}% below baseline ({latest_bone:.3f} vs {base_bone:.3f} g/cm²).",
                    indicators=[{"name": "bone_density change", "value": round(loss_pct, 1), "unit": "%"}],
                    window="mission-to-date derived series",
                    why="Mechanical unloading accelerates bone loss; long-duration crew return with elevated fracture risk.",
                    action="Review resistive exercise compliance and vitamin D/calcium intake with medical personnel.",
                    data_class="derived",
                    evidence=[
                        "Spaceflight bone loss literature summarised in NASA HRP evidence reports (~1-1.5%/month in unloaded regions).",
                        "This value is a model estimate, not a DXA measurement.",
                    ],
                )
            )
        elif loss_pct <= -2:
            signals.append(
                _signal(
                    domain="bone",
                    severity="moderate",
                    title="Bone density trending down",
                    summary=f"Derived bone density is {loss_pct:.1f}% below baseline.",
                    indicators=[{"name": "bone_density change", "value": round(loss_pct, 1), "unit": "%"}],
                    window="mission-to-date derived series",
                    why="Early loss is expected in unloading, but the trajectory should be tracked.",
                    action="Maintain resistive exercise and discuss nutrition with medical personnel.",
                    data_class="derived",
                    evidence=["COSMICARE unloading model (illustrative)."],
                )
            )

    # --- radiation ---
    total = sum(r.dose_increment_msv for r in radiation_daily)
    if total >= 300:
        high = total >= 500
        signals.append(
            _signal(
                domain="radiation",
                severity="high" if high else "moderate",
                title="Cumulative radiation exposure requires review",
                summary=f"Modelled cumulative dose is {total:.1f} mSv for this mission.",
                indicators=[{"name": "cumulative_dose", "value": round(total, 1), "unit": "mSv"}],
                window="mission-to-date modelled exposure",
                why="Cumulative dose raises long-term cancer and degenerative risk; it is a mission-design constraint, not an acute reading.",
                action="Review shielding, mission timeline and the radiation risk briefing with the flight surgeon.",
                data_class="modelled",
                evidence=[
                    "NASA HRP spaceflight radiation exposure discussion.",
                    "Career limits are age/sex dependent and set by flight surgeons; 600 mSv here is only an illustrative screening value.",
                ],
                confidence=0.65,
            )
        )
    spikes = [r for r in radiation_daily if r.dose_increment_msv >= 10]
    if spikes:
        latest_spike = spikes[-1]
        signals.append(
            _signal(
                domain="radiation",
                severity="critical" if latest_spike.dose_increment_msv >= 20 else "high",
                title="Solar particle event dose spike (simulated)",
                summary=f"A modelled single-day dose of {latest_spike.dose_increment_msv:.1f} mSv was recorded ({latest_spike.event_label or 'event'}).",
                indicators=[{"name": "daily_dose", "value": latest_spike.dose_increment_msv, "unit": "mSv"}],
                window="event day",
                why="Acute solar particle events can deliver a large fraction of a mission dose in hours; shelter protocols exist for this reason.",
                action="Follow the radiation shelter protocol and notify the radiation officer; do not use this app for operational dose decisions.",
                data_class="modelled",
                evidence=["Modelled dose from mission profile; solar-event forecast does not equal measured astronaut dose."],
                escalate_incident=True,
                protocol="radiation",
            )
        )

    # --- mental wellbeing (from self-report assessments) ---
    mental = [a for a in assessments if a.kind in ("mental", "daily")]
    if mental:
        latest = mental[-1]
        scores = latest.scores or {}
        mood = scores.get("mood")
        stress = scores.get("stress")
        isolation = scores.get("isolation")
        if scores.get("safety_flag"):
            signals.append(
                _signal(
                    domain="mental_health",
                    severity="critical",
                    title="Self-reported safety concern — immediate human support required",
                    summary="The astronaut reported a serious personal safety concern in a private assessment.",
                    indicators=[{"name": "self_report", "value": "safety concern", "unit": ""}],
                    window="latest assessment",
                    why="Serious self-reported concerns take priority over all analytics and must reach a human clinician immediately.",
                    action="Contact the assigned flight surgeon now via the emergency channel; follow the mission mental-health emergency protocol.",
                    data_class="self_report",
                    evidence=["COSMICARE safety escalation policy; not an LLM decision."],
                    confidence=1.0,
                    escalate_incident=True,
                    protocol="mental_health",
                )
            )
        elif (mood is not None and mood <= 3) or (stress is not None and stress >= 8):
            signals.append(
                _signal(
                    domain="mental_health",
                    severity="moderate",
                    title="Low mood / high stress self-report",
                    summary=f"Latest self-report: mood {mood}/10, stress {stress}/10.",
                    indicators=[
                        {"name": "mood", "value": mood, "unit": "/10"},
                        {"name": "stress", "value": stress, "unit": "/10"},
                    ],
                    window="latest assessment",
                    why="Persistent low mood or high stress in confinement benefits from early, non-stigmatising support.",
                    action="Offer a private check-in with the companion, a relaxation exercise, and optional clinician contact.",
                    data_class="self_report",
                    evidence=["Self-report screening; this is not a diagnosis."],
                    confidence=0.75,
                )
            )
        if isolation is not None and isolation >= 8:
            signals.append(
                _signal(
                    domain="mental_health",
                    severity="low",
                    title="High perceived isolation",
                    summary=f"Self-reported isolation is {isolation}/10.",
                    indicators=[{"name": "isolation", "value": isolation, "unit": "/10"}],
                    window="latest assessment",
                    why="Perceived isolation is a recognised long-duration mission stressor with downstream sleep and performance effects.",
                    action="Schedule a family/ground call where comms allow and plan shared crew activity.",
                    data_class="self_report",
                    evidence=["NASA HRP behavioural health evidence base (isolation and confinement)."],
                )
            )

    # --- long-duration mission context ---
    if mission.planned_duration_days >= 180 and mission.elapsed_duration_days >= 60:
        signals.append(
            _signal(
                domain="mission_context",
                severity="info",
                title="Long-duration monitoring posture active",
                summary="Bone, muscle, radiation, sleep and behavioural domains are weighted for this long-duration profile.",
                indicators=[
                    {"name": "mission day", "value": mission.elapsed_duration_days, "unit": "d"},
                    {"name": "planned duration", "value": mission.planned_duration_days, "unit": "d"},
                ],
                window="mission-to-date",
                why="Risk accumulation is duration-dependent; monitoring rules adapt to the mission profile.",
                action="Continue scheduled countermeasures and periodic assessments.",
                data_class="derived",
                evidence=["Mission profile configuration (adaptable, not hard-coded to one destination)."],
                confidence=1.0,
            )
        )
    return signals


def rank_signals(signals: list[Signal]) -> list[Signal]:
    return sorted(signals, key=lambda s: SEVERITY_RANK.get(s.severity, 0), reverse=True)
