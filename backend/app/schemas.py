"""Request validation schemas (Pydantic v2)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

Role = Literal["astronaut", "medical", "mission_control", "admin"]


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=120)
    role: Role = "astronaut"
    callsign: str | None = Field(default=None, max_length=48)
    invite_code: str | None = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class PasswordResetRequestIn(BaseModel):
    email: EmailStr


class PasswordResetConfirmIn(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)


class PrivacyIn(BaseModel):
    share_mood_summary: bool = False
    share_assessment_notes: bool = False
    allow_research_use: bool = False


class MissionIn(BaseModel):
    name: str = Field(min_length=3, max_length=140)
    code: str | None = Field(default=None, max_length=40)
    category: str = "Custom mission"
    destination: str = "Low Earth Orbit"
    planned_duration_days: int = Field(default=30, ge=1, le=1200)
    elapsed_duration_days: int = Field(default=0, ge=0, le=1200)
    phase: Literal["pre_mission", "in_flight", "post_mission"] = "pre_mission"
    crew_size: int = Field(default=4, ge=1, le=12)
    gravity_g: float = Field(default=0.0, ge=0.0, le=1.6)
    radiation_environment: str = "LEO"
    radiation_dose_rate_msv_day: float = Field(default=0.45, ge=0.0, le=50.0)
    comm_delay_seconds: int = Field(default=2, ge=0, le=7200)
    exercise_available: bool = True
    medical_support: str = "onboard"
    description: str = ""
    environment: dict = Field(default_factory=dict)
    monitoring_profile: dict = Field(default_factory=dict)
    create_demo_crew: bool = False

    @field_validator("code")
    @classmethod
    def upper_code(cls, v: str | None) -> str | None:
        return v.upper().replace(" ", "-") if v else v


class MissionUpdateIn(BaseModel):
    phase: Literal["pre_mission", "in_flight", "post_mission"] | None = None
    elapsed_duration_days: int | None = Field(default=None, ge=0, le=1200)
    status: str | None = None
    monitoring_profile: dict | None = None
    radiation_dose_rate_msv_day: float | None = Field(default=None, ge=0.0, le=50.0)
    comm_delay_seconds: int | None = Field(default=None, ge=0, le=7200)


class AssignmentIn(BaseModel):
    user_id: int
    role_on_mission: str = "crew"
    seat: str = ""


class BaselineIn(BaseModel):
    metric: str
    value: float
    unit: str = ""
    method: str = "clinical_assessment"
    note: str = ""


class AssessmentIn(BaseModel):
    kind: Literal["daily", "mental", "physical", "post_flight"] = "daily"
    answers: dict = Field(default_factory=dict)
    notes: str = ""
    is_private: bool = True
    client_uuid: str | None = None


class ScenarioIn(BaseModel):
    name: str = "Custom scenario"
    seed: int = 2026
    stress: float = Field(default=0.0, ge=0.0, le=1.0)
    sleep_penalty: float = Field(default=0.0, ge=0.0, le=3.0)
    anomaly_bias: float = Field(default=0.0, ge=0.0, le=3.0)
    sensor_fault: bool = False
    solar_event_day: int | None = None
    solar_event_dose_msv: float = Field(default=12.0, ge=0.0, le=500.0)
    solar_event_label: str = "Solar particle event (simulated)"
    comm_interruption: bool = False


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: int | None = None


class IncidentIn(BaseModel):
    mission_id: int
    astronaut_id: int | None = None
    severity: Literal["info", "low", "moderate", "high", "critical"] = "moderate"
    title: str = Field(min_length=3, max_length=180)
    description: str = Field(min_length=3, max_length=4000)
    source: str = "manual"


class IncidentUpdateIn(BaseModel):
    status: Literal["new", "acknowledged", "under_review", "action_required", "resolved"] | None = None
    severity: Literal["info", "low", "moderate", "high", "critical"] | None = None
    assigned_to: int | None = None
    note: str = ""
    resolution_summary: str = ""


class MessageIn(BaseModel):
    mission_id: int
    recipient_id: int | None = None
    channel: Literal["direct", "incident", "announcement", "emergency"] = "direct"
    priority: Literal["normal", "priority", "urgent"] = "normal"
    body: str = Field(min_length=1, max_length=4000)
    incident_id: int | None = None
    client_uuid: str | None = None


class InterventionIn(BaseModel):
    astronaut_id: int
    mission_id: int
    incident_id: int | None = None
    category: str = "clinical"
    description: str = Field(min_length=3, max_length=2000)
    outcome: Literal["pending", "improving", "stable", "resolved", "escalated"] = "pending"
    follow_up_days: int = Field(default=1, ge=0, le=90)


class RecommendationUpdateIn(BaseModel):
    status: Literal["active", "completed", "dismissed"] | None = None
    adherence: int | None = Field(default=None, ge=0, le=100)


class ResearchImportIn(BaseModel):
    title: str
    identifier: str
    source: str = "NASA OSDR"
    source_url: str = ""
    license: str = ""
    modality: str = ""
    description: str = ""
    indicators: list[str] = Field(default_factory=list)
    preprocessing: str = ""
    record_count: int = 0
    is_sample: bool = True


class ResearchAnalysisIn(BaseModel):
    dataset_id: int
    metric: str = "bone_density_change_pct"
