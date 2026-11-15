"""Layer 4 — interchangeable LLM provider with a deterministic local fallback.

Provider selection and credentials are server-side only. If no external provider
is configured, or a call fails, COSMICARE continues with a grounded mock
companion that answers strictly from application data. Safety-critical alerts
never depend on this module (see rules.py).
"""
from __future__ import annotations

import json
import re

import httpx

from .config import settings

SYSTEM_PROMPT = """You are COSMICARE's onboard health companion for astronauts.

Rules you must always follow:
- You are not a doctor. Never diagnose, never prescribe medication, never state or imply a disease diagnosis.
- Use only the supplied COSMICARE context. Never invent sensor readings, mission facts, or NASA research findings.
- Clearly distinguish simulated, measured, derived and predicted values.
- Express uncertainty where it exists.
- Suggest non-diagnostic wellness actions and relevant follow-up questions.
- For chest pain, breathing difficulty, fainting, severe bleeding, or thoughts of self-harm: tell the crew member to contact medical personnel immediately via the emergency channel and follow mission protocol. Do not attempt to manage the emergency yourself.
- Do not claim to contact real emergency services or real mission control.
- Keep private conversations private; do not suggest sharing them unless the astronaut chooses to.
- Be calm, concrete and brief (under 220 words) unless asked for more detail.
"""

SAFETY_PATTERNS = [
    (re.compile(r"\b(suicid|self[- ]?harm|kill myself|end my life|don'?t want to live)\w*", re.I), "mental_health"),
    (re.compile(r"\b(chest pain|crushing chest|can'?t breathe|cannot breathe|passed out|fainted|unconscious)\b", re.I), "medical_emergency"),
    (re.compile(r"\b(severe bleeding|hemorrhage|haemorrhage|stroke|seizure)\b", re.I), "medical_emergency"),
]

ESCALATION_NOTICE = {
    "mental_health": (
        "I want to make sure you get real human support right now. Please contact the assigned flight "
        "surgeon or crew medical officer immediately through the emergency channel, or tell a crewmate "
        "nearby. COSMICARE has flagged this conversation for a clinician only under the mission safety "
        "policy — your journal and chat stay private by default."
    ),
    "medical_emergency": (
        "This may be a medical emergency. Stop and follow the mission emergency medical protocol now and "
        "alert your crew medical officer through the emergency channel. Do not wait for this assistant. "
        "COSMICARE's safety rules run independently of any AI service."
    ),
}


def safety_scan(text: str) -> str | None:
    for pattern, category in SAFETY_PATTERNS:
        if pattern.search(text or ""):
            return category
    return None


def build_context(payload: dict) -> str:
    """Compact, grounded context injected into every provider request."""
    return json.dumps(payload, indent=2, default=str)[:9000]


class MockProvider:
    name = "mock"

    def complete(self, messages: list[dict], context: dict) -> str:
        question = ""
        for m in reversed(messages):
            if m["role"] == "user":
                question = m["content"]
                break
        return self._answer(question, context)

    def _answer(self, question: str, ctx: dict) -> str:
        q = question.lower()
        name = ctx.get("astronaut", {}).get("callsign", "crew member")
        mission = ctx.get("mission", {})
        vitals = ctx.get("latest_simulated_vitals") or {}
        insights = ctx.get("insights", [])
        risks = ctx.get("risk_scores", [])
        sleep = ctx.get("sleep", {})

        parts: list[str] = []
        parts.append(f"Hi {name} — I'm working from the COSMICARE records available to you right now.")

        if vitals:
            parts.append(
                "Latest simulated reading: "
                f"HR {vitals.get('heart_rate')} bpm, SpO2 {vitals.get('spo2')}%, "
                f"BP {vitals.get('systolic')}/{vitals.get('diastolic')} mmHg, "
                f"respiratory rate {vitals.get('resp_rate')}/min. "
                "This is simulated telemetry, not a clinical measurement."
            )

        if any(k in q for k in ("sleep", "tired", "fatigue", "rest")):
            avg = sleep.get("mean")
            parts.append(
                f"Your recent simulated sleep averages {avg} h per night across {sleep.get('samples', 0)} periods. "
                "Sleep debt in flight tends to show up first as slower reaction time and lower HRV. "
                "A consistent sleep window, dimmer light before bed, and a short wind-down routine are reasonable "
                "non-medical steps. If this persists, mention it to your flight surgeon."
            )
        elif any(k in q for k in ("radiation", "dose", "solar")):
            rad = ctx.get("radiation", {})
            parts.append(
                f"Modelled cumulative dose for this mission is {rad.get('cumulative_msv')} mSv at a configured "
                f"rate of {rad.get('rate_msv_day')} mSv/day. That is a model estimate for the selected mission "
                "profile, not a dosimeter record, and solar particle events can change it suddenly. "
                "Follow the mission radiation shelter protocol if an event is declared."
            )
        elif any(k in q for k in ("stress", "anxious", "anxiety", "lonely", "isolation", "mood", "sad")):
            parts.append(
                "Thanks for saying that plainly. Confinement and distance make ordinary stress heavier, and "
                "naming it early is useful. A short paced-breathing exercise (about 4 seconds in, 6 out for "
                "5 minutes) and a message to someone you trust can take the edge off. I can also walk you through "
                "a private relaxation exercise. If this feels unmanageable, contacting your flight surgeon is "
                "appropriate — it is not a sign of weakness and stays medically confidential."
            )
        elif any(k in q for k in ("bone", "muscle", "exercise", "strength")):
            parts.append(
                "Bone and muscle changes here are derived estimates from an illustrative unloading model, not DXA "
                "or dynamometry measurements. Resistive exercise is the main countermeasure available in flight; "
                "consistency matters more than intensity. Your medical team can review the trend with you."
            )
        else:
            if insights:
                top = insights[0]
                parts.append(
                    f"The most relevant active insight is “{top.get('title')}” ({top.get('severity')}, "
                    f"{top.get('data_class')} data). {top.get('summary')}"
                )
            if risks:
                ranked = sorted(risks, key=lambda r: r.get("score", 0), reverse=True)[:2]
                parts.append(
                    "Highest current risk indicators: "
                    + ", ".join(f"{r['domain']} {r['score']}/100" for r in ranked)
                    + " — a heuristic index, not a diagnosis."
                )

        mission_bits = []
        if mission.get("name"):
            mission_bits.append(f"{mission['name']} ({mission.get('destination')})")
        if mission.get("phase"):
            mission_bits.append(f"phase: {mission['phase'].replace('_', ' ')}")
        if mission.get("comm_delay_seconds"):
            mission_bits.append(f"one-way comm delay ≈ {mission['comm_delay_seconds']} s")
        if mission_bits:
            parts.append("Mission context: " + "; ".join(mission_bits) + ".")

        parts.append(
            "I can explain a specific reading, help you prepare a question for the medical team, or guide a "
            "wellness exercise. What would be most useful?"
        )
        return "\n\n".join(parts)


class OpenAICompatibleProvider:
    """Works with OpenAI and any OpenAI-compatible chat-completions endpoint."""

    name = "openai_compatible"

    def __init__(self) -> None:
        self.base_url = settings.llm_base_url.rstrip("/")
        self.model = settings.llm_model

    def complete(self, messages: list[dict], context: dict) -> str:
        payload = {
            "model": self.model,
            "messages": [{"role": "system", "content": SYSTEM_PROMPT + "\n\nCONTEXT:\n" + build_context(context)}]
            + messages[-12:],
            "temperature": 0.4,
            "max_tokens": 700,
        }
        headers = {"Content-Type": "application/json"}
        if settings.llm_api_key:
            headers["Authorization"] = f"Bearer {settings.llm_api_key}"
        with httpx.Client(timeout=settings.llm_timeout_seconds) as client:
            res = client.post(f"{self.base_url}/chat/completions", json=payload, headers=headers)
            res.raise_for_status()
            data = res.json()
        return data["choices"][0]["message"]["content"].strip()


def get_provider():
    if settings.llm_mock or settings.llm_provider == "mock" or not settings.llm_api_key:
        return MockProvider(), "mock"
    if settings.llm_provider in ("openai", "openai_compatible"):
        return OpenAICompatibleProvider(), settings.llm_provider
    return MockProvider(), "mock"


def chat(messages: list[dict], context: dict) -> dict:
    """Return a reply plus transparent provider/fallback metadata."""
    category = safety_scan(messages[-1]["content"] if messages else "")
    provider, provider_name = get_provider()
    fallback_reason = ""

    if category:
        # Safety response is deterministic and never delegated to the LLM.
        return {
            "reply": ESCALATION_NOTICE[category],
            "provider": "safety_protocol",
            "model": "deterministic",
            "safety_escalation": category,
            "fallback": False,
            "grounded_on": "COSMICARE safety protocol",
        }

    try:
        reply = provider.complete(messages, context)
    except Exception as exc:  # External AI must never break essential functionality.
        fallback_reason = f"{type(exc).__name__}: external provider unavailable"
        reply = MockProvider().complete(messages, context)
        provider_name = "mock_fallback"

    return {
        "reply": reply,
        "provider": provider_name,
        "model": settings.llm_model if provider_name.startswith("openai") else "grounded-rules-v1",
        "safety_escalation": None,
        "fallback": bool(fallback_reason),
        "fallback_reason": fallback_reason,
        "grounded_on": "application data snapshot passed with this request",
    }
