"""Reference ranges, mission presets and scientific source attribution.

IMPORTANT: These ranges are general adult physiological reference bands drawn
from public clinical/space-life-science literature. They are CONFIGURABLE,
NOT NASA-approved astronaut thresholds, and are not a diagnostic standard.
See SCIENTIFIC_SOURCES.md and LIMITATIONS.md.
"""
from __future__ import annotations

# metric -> (low, high, unit, source, note)
REFERENCE_RANGES: dict[str, dict] = {
    "heart_rate": {
        "low": 50, "high": 100, "unit": "bpm",
        "source": "American Heart Association, normal adult resting heart rate (60-100 bpm); 50 bpm lower bound allows trained crew.",
        "note": "Resting values; in-flight values are simulated and not clinical.",
    },
    "systolic": {
        "low": 90, "high": 130, "unit": "mmHg",
        "source": "ACC/AHA 2017 blood pressure categories (normal <120, elevated 120-129); upper band widened to 130 for operational triage.",
        "note": "Triage band only.",
    },
    "diastolic": {
        "low": 60, "high": 85, "unit": "mmHg",
        "source": "ACC/AHA 2017 blood pressure categories.",
        "note": "Triage band only.",
    },
    "spo2": {
        "low": 94, "high": 100, "unit": "%",
        "source": "WHO pulse oximetry guidance; <90% is commonly treated as a concerning desaturation.",
        "note": "Pulse oximetry has known accuracy limits.",
    },
    "resp_rate": {
        "low": 10, "high": 22, "unit": "breaths/min",
        "source": "Adult resting respiratory rate reference (12-20/min); widened for operational monitoring.",
        "note": "Triage band only.",
    },
    "body_temp": {
        "low": 35.8, "high": 37.6, "unit": "°C",
        "source": "Standard adult core temperature reference range.",
        "note": "Simulated skin/derived temperature, not core.",
    },
    "sleep_hours": {
        "low": 6.0, "high": 9.0, "unit": "h",
        "source": "National Sleep Foundation adult sleep duration recommendation (7-9 h); widened lower bound for mission operations.",
        "note": "Self/instrumented sleep estimate.",
    },
    "sleep_quality": {
        "low": 55, "high": 100, "unit": "score",
        "source": "COSMICARE composite index derived from sleep duration, interruptions and recovery.",
        "note": "Application-derived index, not a validated instrument.",
    },
    "hrv": {
        "low": 25, "high": 120, "unit": "ms",
        "source": "Population HRV (RMSSD) is highly individual; bands are illustrative only.",
        "note": "Individual baseline comparison is strongly preferred over population bands.",
    },
    "recovery_score": {
        "low": 50, "high": 100, "unit": "score",
        "source": "COSMICARE composite of sleep, HRV deviation and exercise load.",
        "note": "Derived application index.",
    },
    "bone_density": {
        "low": 1.0, "high": 1.4, "unit": "g/cm²",
        "source": "Illustrative DXA-derived areal BMD band; spaceflight bone loss literature (e.g. NASA HRP evidence) reports ~1-1.5%/month in unloaded regions.",
        "note": "Derived estimate in this build, not a DXA measurement.",
    },
    "grip_strength": {
        "low": 30, "high": 60, "unit": "kg",
        "source": "Illustrative adult grip strength band; highly sex/age dependent.",
        "note": "Simulated assessment value.",
    },
    "cumulative_dose": {
        "low": 0, "high": 600, "unit": "mSv",
        "source": "NASA HRP / OCHMO spaceflight radiation exposure discussion; career and mission limits are age/sex dependent and set by flight surgeons.",
        "note": "Simulated/modelled dose; not an official record.",
    },
}

SEVERITY_RANK = {"info": 0, "low": 1, "moderate": 2, "high": 3, "critical": 4}

MISSION_PRESETS: list[dict] = [
    {
        "code": "ARTEMIS-ORBIT",
        "name": "Artemis Orbital Readiness",
        "category": "Short-duration orbital",
        "destination": "Low Earth Orbit",
        "planned_duration_days": 14,
        "phase": "in_flight",
        "crew_size": 4,
        "gravity_g": 0.0,
        "radiation_environment": "LEO",
        "radiation_dose_rate_msv_day": 0.4,
        "comm_delay_seconds": 2,
        "exercise_available": True,
        "medical_support": "onboard",
        "description": "Two-week commercial orbital rotation focused on acute physiological change and return readiness.",
        "environment": {"cabin_pressure_kpa": 101.3, "co2_ppm": 2400, "noise_db": 62},
        "monitoring_profile": {
            "focus": ["cardiovascular", "sleep", "pre_flight_readiness", "post_flight_recovery"],
            "weights": {"cardiovascular": 1.0, "radiation": 0.4, "bone": 0.3, "muscle": 0.4, "mental": 0.7, "sleep": 0.9},
            "thresholds_multiplier": 1.0,
        },
    },
    {
        "code": "ISS-EXPEDITION",
        "name": "ISS Expedition — Integrated Rotation",
        "category": "ISS mission",
        "destination": "International Space Station",
        "planned_duration_days": 180,
        "phase": "in_flight",
        "crew_size": 4,
        "gravity_g": 0.0,
        "radiation_environment": "LEO",
        "radiation_dose_rate_msv_day": 0.45,
        "comm_delay_seconds": 1,
        "exercise_available": True,
        "medical_support": "onboard",
        "description": "Six-month LEO expedition with full exercise hardware and near-real-time medical support.",
        "environment": {"cabin_pressure_kpa": 101.3, "co2_ppm": 2800, "noise_db": 60},
        "monitoring_profile": {
            "focus": ["bone", "muscle", "cardiovascular", "sleep", "radiation", "mental"],
            "weights": {"cardiovascular": 0.9, "radiation": 0.8, "bone": 0.9, "muscle": 0.9, "mental": 0.8, "sleep": 0.9},
            "thresholds_multiplier": 1.0,
        },
    },
    {
        "code": "LUNAR-GATEWAY",
        "name": "Lunar Gateway — South Pole Transit",
        "category": "Lunar mission",
        "destination": "NRHO / Lunar Gateway",
        "planned_duration_days": 90,
        "phase": "in_flight",
        "crew_size": 4,
        "gravity_g": 0.0,
        "radiation_environment": "LUNAR_TRANSIT",
        "radiation_dose_rate_msv_day": 1.1,
        "comm_delay_seconds": 3,
        "exercise_available": True,
        "medical_support": "telemedicine_delayed",
        "description": "Lunar orbital outpost with intermittent surface excursions and limited evacuation windows.",
        "environment": {"cabin_pressure_kpa": 70.0, "co2_ppm": 3000, "noise_db": 55},
        "monitoring_profile": {
            "focus": ["radiation", "bone", "muscle", "cardiovascular", "mental", "sleep"],
            "weights": {"cardiovascular": 0.8, "radiation": 1.0, "bone": 0.9, "muscle": 0.9, "mental": 0.9, "sleep": 0.9},
            "thresholds_multiplier": 0.95,
        },
    },
    {
        "code": "MARS-TRANSIT",
        "name": "Mars Transit — Deep Space Venture",
        "category": "Deep-space mission",
        "destination": "Mars transit / interplanetary",
        "planned_duration_days": 540,
        "phase": "in_flight",
        "crew_size": 6,
        "gravity_g": 0.0,
        "radiation_environment": "DEEP_SPACE",
        "radiation_dose_rate_msv_day": 1.8,
        "comm_delay_seconds": 1200,
        "exercise_available": True,
        "medical_support": "autonomous_augmented",
        "description": "Long-duration interplanetary transit: cumulative radiation, muscle/bone loss, isolation and 40-minute round-trip comm delays.",
        "environment": {"cabin_pressure_kpa": 101.3, "co2_ppm": 3200, "noise_db": 58},
        "monitoring_profile": {
            "focus": ["radiation", "bone", "muscle", "cardiovascular", "mental", "sleep", "autonomy"],
            "weights": {"cardiovascular": 0.85, "radiation": 1.0, "bone": 1.0, "muscle": 1.0, "mental": 1.0, "sleep": 1.0},
            "thresholds_multiplier": 0.9,
            "autonomy": "high",
        },
    },
    {
        "code": "SUBORBITAL-X",
        "name": "Suborbital Research Hop",
        "category": "Suborbital",
        "destination": "Suborbital trajectory",
        "planned_duration_days": 1,
        "phase": "in_flight",
        "crew_size": 3,
        "gravity_g": 0.0,
        "radiation_environment": "LEO",
        "radiation_dose_rate_msv_day": 0.02,
        "comm_delay_seconds": 0,
        "exercise_available": False,
        "medical_support": "ground_immediate",
        "description": "Minutes of microgravity: acute cardiovascular and vestibular response dominate.",
        "environment": {"cabin_pressure_kpa": 101.3, "co2_ppm": 1200, "noise_db": 70},
        "monitoring_profile": {
            "focus": ["cardiovascular", "pre_flight_readiness", "acute_response"],
            "weights": {"cardiovascular": 1.0, "radiation": 0.1, "bone": 0.1, "muscle": 0.2, "mental": 0.3, "sleep": 0.3},
            "thresholds_multiplier": 1.1,
        },
    },
    {
        "code": "MARS-SURFACE",
        "name": "Mars Surface Habitat — 1.2 Year",
        "category": "Mars exploration",
        "destination": "Mars surface",
        "planned_duration_days": 450,
        "phase": "in_flight",
        "crew_size": 4,
        "gravity_g": 0.38,
        "radiation_environment": "MARS_SURFACE",
        "radiation_dose_rate_msv_day": 0.6,
        "comm_delay_seconds": 900,
        "exercise_available": True,
        "medical_support": "autonomous_augmented",
        "description": "Partial gravity operations with surface dust exposure and long evacuation timelines.",
        "environment": {"cabin_pressure_kpa": 55.0, "co2_ppm": 2600, "noise_db": 52, "dust": "perchlorate_trace"},
        "monitoring_profile": {
            "focus": ["bone", "muscle", "radiation", "mental", "sleep", "cardiovascular"],
            "weights": {"cardiovascular": 0.8, "radiation": 0.9, "bone": 0.85, "muscle": 0.9, "mental": 1.0, "sleep": 0.95},
            "thresholds_multiplier": 0.95,
        },
    },
]

RADIATION_ENVIRONMENTS: dict[str, dict] = {
    "LEO": {"label": "Low Earth Orbit", "dose_rate_msv_day": 0.45, "source": "Illustrative LEO dose estimate (~0.3-0.6 mSv/day, NASA HRP radiation literature)."},
    "LUNAR_TRANSIT": {"label": "Lunar transit / NRHO", "dose_rate_msv_day": 1.1, "source": "Illustrative free-space transit estimate outside most geomagnetic shielding."},
    "LUNAR_SURFACE": {"label": "Lunar surface", "dose_rate_msv_day": 1.4, "source": "Illustrative lunar surface estimate (NASA HRP)."},
    "DEEP_SPACE": {"label": "Deep space", "dose_rate_msv_day": 1.8, "source": "Illustrative deep-space galactic cosmic ray estimate (NASA HRP)."},
    "MARS_SURFACE": {"label": "Mars surface", "dose_rate_msv_day": 0.6, "source": "Illustrative Mars surface estimate with thin atmosphere shielding."},
}

SAFETY_LIMITS = {
    "ocs_dose_msv": 600,
    "note": "Illustrative mission screening value only. Real career limits are age/sex dependent and set by flight surgeons (NASA HRP).",
}
