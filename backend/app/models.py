"""Normalised data model for COSMICARE.

SQLite for development; all access goes through SQLAlchemy so PostgreSQL can be
adopted by changing DATABASE_URL. Timestamps are UTC.
"""
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(160))
    role: Mapped[str] = mapped_column(String(32), index=True)  # astronaut|medical|mission_control|admin
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reset_token: Mapped[str | None] = mapped_column(String(120), nullable=True)
    reset_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    astronaut_profile: Mapped["AstronautProfile"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    medical_profile: Mapped["MedicalProfile"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    privacy: Mapped["PrivacyPreference"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    assignments: Mapped[list["MissionAssignment"]] = relationship(back_populates="user")


class PrivacyPreference(Base, TimestampMixin):
    __tablename__ = "privacy_preferences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    # Mission Control sees operational summaries; mood detail is opt-in.
    share_mood_summary: Mapped[bool] = mapped_column(Boolean, default=False)
    share_assessment_notes: Mapped[bool] = mapped_column(Boolean, default=False)
    share_ai_chat: Mapped[bool] = mapped_column(Boolean, default=False)
    allow_research_use: Mapped[bool] = mapped_column(Boolean, default=False)

    user: Mapped[User] = relationship(back_populates="privacy")


class AstronautProfile(Base, TimestampMixin):
    __tablename__ = "astronaut_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    callsign: Mapped[str] = mapped_column(String(64))
    age: Mapped[int] = mapped_column(Integer, default=35)
    sex: Mapped[str] = mapped_column(String(16), default="unspecified")
    height_cm: Mapped[float] = mapped_column(Float, default=175.0)
    weight_kg: Mapped[float] = mapped_column(Float, default=72.0)
    agency: Mapped[str] = mapped_column(String(80), default="Demo Crew")
    flight_hours: Mapped[int] = mapped_column(Integer, default=0)
    health_history: Mapped[str] = mapped_column(Text, default="")
    risk_flags: Mapped[list] = mapped_column(JSON, default=list)
    readiness: Mapped[dict] = mapped_column(JSON, default=dict)

    user: Mapped[User] = relationship(back_populates="astronaut_profile")
    baselines: Mapped[list["HealthBaseline"]] = relationship(
        back_populates="astronaut", cascade="all, delete-orphan"
    )


class MedicalProfile(Base, TimestampMixin):
    __tablename__ = "medical_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    specialty: Mapped[str] = mapped_column(String(120), default="Flight Medicine")
    credential_id: Mapped[str] = mapped_column(String(80), default="DEMO-MED")

    user: Mapped[User] = relationship(back_populates="medical_profile")


class Mission(Base, TimestampMixin):
    __tablename__ = "missions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(64))
    destination: Mapped[str] = mapped_column(String(120))
    planned_duration_days: Mapped[int] = mapped_column(Integer, default=180)
    elapsed_duration_days: Mapped[int] = mapped_column(Integer, default=0)
    phase: Mapped[str] = mapped_column(String(32), default="pre_mission")
    status: Mapped[str] = mapped_column(String(32), default="active")
    crew_size: Mapped[int] = mapped_column(Integer, default=4)
    gravity_g: Mapped[float] = mapped_column(Float, default=0.0)
    radiation_environment: Mapped[str] = mapped_column(String(40), default="LEO")
    radiation_dose_rate_msv_day: Mapped[float] = mapped_column(Float, default=0.4)
    comm_delay_seconds: Mapped[int] = mapped_column(Integer, default=2)
    exercise_available: Mapped[bool] = mapped_column(Boolean, default=True)
    medical_support: Mapped[str] = mapped_column(String(40), default="onboard")
    environment: Mapped[dict] = mapped_column(JSON, default=dict)
    monitoring_profile: Mapped[dict] = mapped_column(JSON, default=dict)
    description: Mapped[str] = mapped_column(Text, default="")

    assignments: Mapped[list["MissionAssignment"]] = relationship(
        back_populates="mission", cascade="all, delete-orphan"
    )
    snapshots: Mapped[list["TelemetrySnapshot"]] = relationship(back_populates="mission")


class MissionAssignment(Base, TimestampMixin):
    __tablename__ = "mission_assignments"
    __table_args__ = (UniqueConstraint("mission_id", "user_id", name="uq_mission_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mission_id: Mapped[int] = mapped_column(ForeignKey("missions.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role_on_mission: Mapped[str] = mapped_column(String(40), default="crew")
    seat: Mapped[str] = mapped_column(String(40), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    mission: Mapped[Mission] = relationship(back_populates="assignments")
    user: Mapped[User] = relationship(back_populates="assignments")


class HealthBaseline(Base, TimestampMixin):
    __tablename__ = "health_baselines"
    __table_args__ = (Index("ix_baseline_astronaut_metric", "astronaut_id", "metric"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    astronaut_id: Mapped[int] = mapped_column(ForeignKey("astronaut_profiles.id", ondelete="CASCADE"))
    mission_id: Mapped[int | None] = mapped_column(ForeignKey("missions.id"), nullable=True)
    metric: Mapped[str] = mapped_column(String(48))
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(24), default="")
    method: Mapped[str] = mapped_column(String(48), default="clinical_assessment")
    note: Mapped[str] = mapped_column(Text, default="")

    astronaut: Mapped[AstronautProfile] = relationship(back_populates="baselines")


class TelemetrySnapshot(Base, TimestampMixin):
    """One sample of simulated physiological telemetry.

    source is always "simulated" in this build; kept explicit so future real
    sensor ingestion can never be confused with generated data.
    """

    __tablename__ = "telemetry_snapshots"
    __table_args__ = (Index("ix_telemetry_astronaut_time", "astronaut_id", "recorded_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    astronaut_id: Mapped[int] = mapped_column(ForeignKey("astronaut_profiles.id", ondelete="CASCADE"))
    mission_id: Mapped[int] = mapped_column(ForeignKey("missions.id", ondelete="CASCADE"), index=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    heart_rate: Mapped[float] = mapped_column(Float)
    hrv: Mapped[float] = mapped_column(Float)
    systolic: Mapped[float] = mapped_column(Float)
    diastolic: Mapped[float] = mapped_column(Float)
    spo2: Mapped[float] = mapped_column(Float)
    resp_rate: Mapped[float] = mapped_column(Float)
    body_temp: Mapped[float] = mapped_column(Float)
    steps: Mapped[int] = mapped_column(Integer)
    sleep_hours: Mapped[float] = mapped_column(Float)
    sleep_quality: Mapped[float] = mapped_column(Float)
    exercise_minutes: Mapped[float] = mapped_column(Float)
    recovery_score: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(32), default="simulated")
    scenario_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sensor_status: Mapped[str] = mapped_column(String(24), default="nominal")

    mission: Mapped[Mission] = relationship(back_populates="snapshots")


class HealthObservation(Base, TimestampMixin):
    """Laboratory / assessment / derived indicators that wearables cannot measure."""

    __tablename__ = "health_observations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    astronaut_id: Mapped[int] = mapped_column(ForeignKey("astronaut_profiles.id", ondelete="CASCADE"), index=True)
    mission_id: Mapped[int] = mapped_column(ForeignKey("missions.id", ondelete="CASCADE"), index=True)
    metric: Mapped[str] = mapped_column(String(48))
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(24))
    method: Mapped[str] = mapped_column(String(32), default="derived_model")
    source_ref: Mapped[str] = mapped_column(String(200), default="")
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Assessment(Base, TimestampMixin):
    __tablename__ = "assessments"
    __table_args__ = (Index("ix_assessment_astronaut_time", "astronaut_id", "created_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    astronaut_id: Mapped[int] = mapped_column(ForeignKey("astronaut_profiles.id", ondelete="CASCADE"))
    mission_id: Mapped[int] = mapped_column(ForeignKey("missions.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(32), default="daily")  # daily|mental|physical|post_flight
    answers: Mapped[dict] = mapped_column(JSON, default=dict)
    scores: Mapped[dict] = mapped_column(JSON, default=dict)
    notes: Mapped[str] = mapped_column(Text, default="")
    is_private: Mapped[bool] = mapped_column(Boolean, default=True)
    client_uuid: Mapped[str | None] = mapped_column(String(64), nullable=True)


class RadiationRecord(Base, TimestampMixin):
    __tablename__ = "radiation_records"
    __table_args__ = (Index("ix_radiation_astronaut_time", "astronaut_id", "recorded_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    astronaut_id: Mapped[int] = mapped_column(ForeignKey("astronaut_profiles.id", ondelete="CASCADE"))
    mission_id: Mapped[int] = mapped_column(ForeignKey("missions.id", ondelete="CASCADE"))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    dose_increment_msv: Mapped[float] = mapped_column(Float)
    dose_rate_msv_day: Mapped[float] = mapped_column(Float)
    source_type: Mapped[str] = mapped_column(String(32), default="modelled")  # modelled|simulated_dosimeter
    event_label: Mapped[str] = mapped_column(String(80), default="")


class ResearchDataset(Base, TimestampMixin):
    __tablename__ = "research_datasets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    identifier: Mapped[str] = mapped_column(String(120), unique=True)
    source: Mapped[str] = mapped_column(String(120), default="NASA OSDR")
    source_url: Mapped[str] = mapped_column(String(300), default="")
    license: Mapped[str] = mapped_column(String(120), default="")
    modality: Mapped[str] = mapped_column(String(80), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    indicators: Mapped[list] = mapped_column(JSON, default=list)
    preprocessing: Mapped[str] = mapped_column(Text, default="")
    record_count: Mapped[int] = mapped_column(Integer, default=0)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=True)
    imported_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    analysis: Mapped[dict] = mapped_column(JSON, default=dict)


class AIInsight(Base, TimestampMixin):
    __tablename__ = "ai_insights"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    astronaut_id: Mapped[int] = mapped_column(ForeignKey("astronaut_profiles.id", ondelete="CASCADE"), index=True)
    mission_id: Mapped[int] = mapped_column(ForeignKey("missions.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(40))  # rule|trend|prediction|summary
    domain: Mapped[str] = mapped_column(String(40), default="general")
    severity: Mapped[str] = mapped_column(String(24), default="info")
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(Text)
    explanation: Mapped[dict] = mapped_column(JSON, default=dict)
    confidence: Mapped[float] = mapped_column(Float, default=0.6)
    data_class: Mapped[str] = mapped_column(String(40), default="derived")
    status: Mapped[str] = mapped_column(String(24), default="open")


class RiskAssessment(Base, TimestampMixin):
    __tablename__ = "risk_assessments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    astronaut_id: Mapped[int] = mapped_column(ForeignKey("astronaut_profiles.id", ondelete="CASCADE"))
    mission_id: Mapped[int] = mapped_column(ForeignKey("missions.id", ondelete="CASCADE"))
    domain: Mapped[str] = mapped_column(String(48))
    score: Mapped[float] = mapped_column(Float)
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    horizon_days: Mapped[int] = mapped_column(Integer, default=30)
    rationale: Mapped[dict] = mapped_column(JSON, default=dict)


class Recommendation(Base, TimestampMixin):
    __tablename__ = "recommendations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    astronaut_id: Mapped[int] = mapped_column(ForeignKey("astronaut_profiles.id", ondelete="CASCADE"))
    mission_id: Mapped[int] = mapped_column(ForeignKey("missions.id", ondelete="CASCADE"))
    category: Mapped[str] = mapped_column(String(48))
    title: Mapped[str] = mapped_column(String(160))
    detail: Mapped[str] = mapped_column(Text)
    rationale: Mapped[str] = mapped_column(Text, default="")
    priority: Mapped[str] = mapped_column(String(16), default="routine")
    status: Mapped[str] = mapped_column(String(16), default="active")
    adherence: Mapped[int] = mapped_column(Integer, default=0)


class Intervention(Base, TimestampMixin):
    __tablename__ = "interventions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    astronaut_id: Mapped[int] = mapped_column(ForeignKey("astronaut_profiles.id", ondelete="CASCADE"))
    mission_id: Mapped[int] = mapped_column(ForeignKey("missions.id", ondelete="CASCADE"))
    incident_id: Mapped[int | None] = mapped_column(ForeignKey("incidents.id"), nullable=True)
    recorded_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    category: Mapped[str] = mapped_column(String(48), default="clinical")
    description: Mapped[str] = mapped_column(Text)
    outcome: Mapped[str] = mapped_column(String(32), default="pending")
    follow_up_days: Mapped[int] = mapped_column(Integer, default=1)


class Incident(Base, TimestampMixin):
    __tablename__ = "incidents"
    __table_args__ = (Index("ix_incident_mission_status", "mission_id", "status"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mission_id: Mapped[int] = mapped_column(ForeignKey("missions.id", ondelete="CASCADE"))
    astronaut_id: Mapped[int | None] = mapped_column(ForeignKey("astronaut_profiles.id"), nullable=True)
    source: Mapped[str] = mapped_column(String(40), default="manual")
    severity: Mapped[str] = mapped_column(String(16), default="moderate")
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), default="new")
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolution_summary: Mapped[str] = mapped_column(Text, default="")

    events: Mapped[list["IncidentEvent"]] = relationship(
        back_populates="incident", cascade="all, delete-orphan", order_by="IncidentEvent.created_at"
    )


class IncidentEvent(Base, TimestampMixin):
    __tablename__ = "incident_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    incident_id: Mapped[int] = mapped_column(ForeignKey("incidents.id", ondelete="CASCADE"))
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(48))
    note: Mapped[str] = mapped_column(Text, default="")

    incident: Mapped[Incident] = relationship(back_populates="events")


class Message(Base, TimestampMixin):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mission_id: Mapped[int] = mapped_column(ForeignKey("missions.id", ondelete="CASCADE"), index=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    recipient_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    incident_id: Mapped[int | None] = mapped_column(ForeignKey("incidents.id"), nullable=True)
    channel: Mapped[str] = mapped_column(String(24), default="direct")
    priority: Mapped[str] = mapped_column(String(16), default="normal")
    body: Mapped[str] = mapped_column(Text)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    client_uuid: Mapped[str | None] = mapped_column(String(64), nullable=True)


class Notification(Base, TimestampMixin):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    level: Mapped[str] = mapped_column(String(16), default="info")
    link: Mapped[str] = mapped_column(String(200), default="")
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_actor_time", "actor_id", "created_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    actor_role: Mapped[str] = mapped_column(String(32), default="")
    action: Mapped[str] = mapped_column(String(80))
    entity: Mapped[str] = mapped_column(String(60), default="")
    entity_id: Mapped[str] = mapped_column(String(60), default="")
    detail: Mapped[str] = mapped_column(Text, default="")
    ip: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class TelemetryScenario(Base, TimestampMixin):
    __tablename__ = "telemetry_scenarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mission_id: Mapped[int] = mapped_column(ForeignKey("missions.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(120))
    seed: Mapped[int] = mapped_column(Integer, default=2026)
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class LifecycleReport(Base, TimestampMixin):
    __tablename__ = "lifecycle_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mission_id: Mapped[int] = mapped_column(ForeignKey("missions.id", ondelete="CASCADE"))
    astronaut_id: Mapped[int | None] = mapped_column(ForeignKey("astronaut_profiles.id"), nullable=True)
    phase: Mapped[str] = mapped_column(String(32))
    title: Mapped[str] = mapped_column(String(200))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class ChatConversation(Base, TimestampMixin):
    __tablename__ = "chat_conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    astronaut_id: Mapped[int] = mapped_column(ForeignKey("astronaut_profiles.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(160), default="New conversation")
    is_private: Mapped[bool] = mapped_column(Boolean, default=True)

    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan", order_by="ChatMessage.created_at"
    )


class ChatMessage(Base, TimestampMixin):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("chat_conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(16))  # user|assistant|system
    content: Mapped[str] = mapped_column(Text)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)

    conversation: Mapped[ChatConversation] = relationship(back_populates="messages")
