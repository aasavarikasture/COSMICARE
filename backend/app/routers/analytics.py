"""Mission analytics, cross-domain summaries and downloadable reports."""
from __future__ import annotations

from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import analytics, simulation
from ..database import get_db
from ..models import (
    AIInsight,
    Assessment,
    AstronautProfile,
    Incident,
    Intervention,
    Mission,
    MissionAssignment,
    RadiationRecord,
    Recommendation,
    RiskAssessment,
    User,
)
from ..security import audit, ensure_astronaut_access, ensure_mission_access, get_current_user
from ..serializers import insight_out, mission_out, recommendation_out, risk_out, snapshot_out

router = APIRouter(prefix="/api", tags=["analytics"])


@router.get("/analytics/mission")
def mission_analytics(
    mission_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ensure_mission_access(user, mission_id, db)
    mission = db.get(Mission, mission_id)
    if not mission:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mission not found")

    crew = simulation.crew_for_mission(db, mission)
    crew_rows = []
    domain_totals: dict[str, list[float]] = {}
    for profile in crew:
        latest = simulation.latest_snapshot(db, profile.id)
        risks = list(
            db.scalars(
                select(RiskAssessment).where(
                    RiskAssessment.astronaut_id == profile.id,
                    RiskAssessment.mission_id == mission.id,
                )
            ).all()
        )
        for r in risks:
            domain_totals.setdefault(r.domain, []).append(r.score)
        dose = simulation.cumulative_dose(db, profile.id, mission.id)
        insights = list(
            db.scalars(
                select(AIInsight)
                .where(AIInsight.astronaut_id == profile.id, AIInsight.mission_id == mission.id)
                .order_by(AIInsight.created_at.desc())
                .limit(3)
            ).all()
        )
        crew_rows.append(
            {
                "astronaut_id": profile.id,
                "callsign": profile.callsign,
                "name": profile.user.full_name if profile.user else "",
                "latest": snapshot_out(latest),
                "top_risk": max(risks, key=lambda r: r.score).domain if risks else None,
                "max_risk_score": max((r.score for r in risks), default=0),
                "cumulative_dose_msv": dose,
                "insights": [insight_out(i) for i in insights],
            }
        )

    incidents = list(
        db.scalars(
            select(Incident).where(Incident.mission_id == mission_id).order_by(Incident.created_at.desc())
        ).all()
    )
    return {
        "mission": mission_out(mission, db),
        "crew": crew_rows,
        "risk_distribution": {
            domain: {
                "mean": round(sum(vals) / len(vals), 1),
                "max": round(max(vals), 1),
                "crew_above_50": sum(1 for v in vals if v >= 50),
            }
            for domain, vals in domain_totals.items()
        },
        "incidents": {
            "total": len(incidents),
            "open": sum(
                1
                for i in incidents
                if i.status in ("new", "acknowledged", "under_review", "action_required")
            ),
            "by_severity": {
                sev: sum(1 for i in incidents if i.severity == sev)
                for sev in ("info", "low", "moderate", "high", "critical")
            },
        },
        "radiation": {
            "environment": mission.radiation_environment,
            "rate_msv_day": mission.radiation_dose_rate_msv_day,
            "crew_mean_cumulative_msv": round(
                sum(r["cumulative_dose_msv"] for r in crew_rows) / max(1, len(crew_rows)), 1
            ),
        },
        "mission_duration": {
            "planned_days": mission.planned_duration_days,
            "elapsed_days": mission.elapsed_duration_days,
            "progress_pct": round(
                min(100.0, mission.elapsed_duration_days / max(1, mission.planned_duration_days) * 100), 1
            ),
        },
        "cross_domain": {
            "note": "Cross-domain relationships are exploratory correlations on simulated data, not causal findings.",
            "sleep_vs_recovery": _mission_correlation(db, crew, "sleep_hours", "recovery_score"),
        },
        "data_labels": {"telemetry": "simulated", "indicators": "derived", "predictions": "estimated"},
    }


def _mission_correlation(db: Session, crew, x_attr: str, y_attr: str) -> dict:
    import numpy as np

    pairs_x, pairs_y = [], []
    for profile in crew:
        rows = simulation.snapshot_history(db, profile.id, limit=200)
        for r in rows:
            pairs_x.append(getattr(r, x_attr))
            pairs_y.append(getattr(r, y_attr))
    if len(pairs_x) < 10:
        return {"available": False}
    r = float(np.corrcoef(np.array(pairs_x, dtype=float), np.array(pairs_y, dtype=float))[0, 1])
    return {"available": True, "r": round(r, 2), "n": len(pairs_x), "label": f"{x_attr} vs {y_attr}"}


@router.get("/analytics/astronaut/{astronaut_id}")
def astronaut_analytics(
    astronaut_id: int,
    mission_id: int | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.get(AstronautProfile, astronaut_id)
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Astronaut not found")
    ensure_astronaut_access(user, profile, db)
    mission_id = mission_id or db.scalar(
        select(MissionAssignment.mission_id).where(MissionAssignment.user_id == profile.user_id)
    )
    mission = db.get(Mission, mission_id) if mission_id else None
    if not mission:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mission not found")
    snaps = simulation.snapshot_history(db, profile.id, mission.id, limit=400)
    return {
        "astronaut": {"id": profile.id, "callsign": profile.callsign},
        "mission": mission_out(mission),
        "series": [snapshot_out(s) for s in snaps],
        "statistics": {
            metric: analytics.describe_series(snaps, metric)
            for metric in ("heart_rate", "hrv", "spo2", "sleep_hours", "recovery_score", "systolic")
        },
        "anomaly": analytics.detect_anomalies(snaps),
        "correlations": analytics.correlations(snaps),
        "risks": [
            risk_out(r)
            for r in db.scalars(
                select(RiskAssessment).where(
                    RiskAssessment.astronaut_id == profile.id,
                    RiskAssessment.mission_id == mission.id,
                )
            ).all()
        ],
    }


def _mission_report_payload(db: Session, mission: Mission) -> dict:
    crew = simulation.crew_for_mission(db, mission)
    crew_data = []
    for profile in crew:
        latest = simulation.latest_snapshot(db, profile.id)
        insights = list(
            db.scalars(
                select(AIInsight)
                .where(AIInsight.astronaut_id == profile.id, AIInsight.mission_id == mission.id)
                .order_by(AIInsight.created_at.desc())
                .limit(5)
            ).all()
        )
        risks = list(
            db.scalars(
                select(RiskAssessment).where(
                    RiskAssessment.astronaut_id == profile.id,
                    RiskAssessment.mission_id == mission.id,
                )
            ).all()
        )
        crew_data.append(
            {
                "astronaut": {
                    "id": profile.id,
                    "callsign": profile.callsign,
                    "name": profile.user.full_name if profile.user else "",
                },
                "latest": snapshot_out(latest),
                "cumulative_dose_msv": simulation.cumulative_dose(db, profile.id, mission.id),
                "risk_scores": [risk_out(r) for r in risks],
                "insights": [insight_out(i) for i in insights],
                "recommendations": [
                    recommendation_out(r)
                    for r in db.scalars(
                        select(Recommendation).where(
                            Recommendation.astronaut_id == profile.id,
                            Recommendation.mission_id == mission.id,
                        )
                    ).all()
                ],
            }
        )
    incidents = list(
        db.scalars(select(Incident).where(Incident.mission_id == mission.id).order_by(Incident.created_at)).all()
    )
    interventions = list(
        db.scalars(select(Intervention).where(Intervention.mission_id == mission.id)).all()
    )
    return {
        "mission": mission_out(mission, db),
        "generated_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "crew": crew_data,
        "incidents": [
            {
                "id": i.id,
                "title": i.title,
                "severity": i.severity,
                "status": i.status,
                "created_at": i.created_at.isoformat(),
            }
            for i in incidents
        ],
        "interventions": [
            {"id": i.id, "category": i.category, "outcome": i.outcome, "description": i.description}
            for i in interventions
        ],
        "limitations": [
            "All physiological telemetry in this report is simulated by COSMICARE.",
            "Indicators and predictions are decision-support estimates, not diagnoses.",
            "Bone and muscle values are model-derived, not DXA or dynamometry measurements.",
            "Imported research data is aggregated and historical; it is never live crew telemetry.",
            "NASA has not endorsed this application.",
        ],
        "sources": [
            "NASA OSDR portal (https://osdr.nasa.gov/bio/repo/) — public research repository.",
            "NASA HRP Human Research Roadmap (https://humanresearchroadmap.nasa.gov/) — risk context.",
            "NOAA SWPC planetary K index — observed space weather.",
            "Reference ranges documented in SCIENTIFIC_SOURCES.md; configurable, not NASA-approved clinical thresholds.",
        ],
    }


@router.get("/reports/{mission_id}")
def report_json(
    mission_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ensure_mission_access(user, mission_id, db)
    mission = db.get(Mission, mission_id)
    if not mission:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mission not found")
    return _mission_report_payload(db, mission)


@router.get("/reports/{mission_id}/pdf")
def report_pdf(
    mission_id: int,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ensure_mission_access(user, mission_id, db)
    mission = db.get(Mission, mission_id)
    if not mission:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mission not found")
    payload = _mission_report_payload(db, mission)

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                            topMargin=18 * mm, bottomMargin=18 * mm,
                            title=f"COSMICARE — {mission.name}")
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Title"], fontSize=20, spaceAfter=6, textColor=colors.HexColor("#101418"))
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=12, spaceBefore=12, spaceAfter=4,
                        textColor=colors.HexColor("#1f2a30"))
    body = ParagraphStyle("body", parent=styles["BodyText"], fontSize=9, leading=12)
    small = ParagraphStyle("small", parent=body, fontSize=7.5, leading=9.5, textColor=colors.HexColor("#4a4f52"))

    story = []
    story.append(Paragraph("COSMICARE", h1))
    story.append(Paragraph("Intelligent Care for the Final Frontier — Mission Health Report", h2))
    story.append(Paragraph(f"Mission: <b>{mission.name}</b> ({mission.code}) — {mission.destination}", body))
    story.append(Paragraph(
        f"Category: {mission.category} · Phase: {mission.phase.replace('_', ' ')} · "
        f"Day {mission.elapsed_duration_days} of {mission.planned_duration_days} · "
        f"Gravity {mission.gravity_g} g · Comm delay {mission.comm_delay_seconds} s", body))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "All physiological telemetry in this report is SIMULATED. AI indicators are decision support, not diagnoses. "
        "NASA has not endorsed COSMICARE.", small))
    story.append(Spacer(1, 8))

    story.append(Paragraph("Crew health summaries", h2))
    for member in payload["crew"]:
        latest = member["latest"] or {}
        risks = member["risk_scores"]
        top_risks = ", ".join(f"{r['domain']} {r['score']:.0f}" for r in
                              sorted(risks, key=lambda x: x["score"], reverse=True)[:3]) or "none"
        story.append(Paragraph(f"<b>{member['astronaut']['name']} ({member['astronaut']['callsign']})</b>", body))
        story.append(Paragraph(
            f"Simulated latest: HR {latest.get('heart_rate', '—')} bpm · SpO₂ {latest.get('spo2', '—')}% · "
            f"BP {latest.get('systolic', '—')}/{latest.get('diastolic', '—')} mmHg · "
            f"Sleep {latest.get('sleep_hours', '—')} h · Modelled dose {member['cumulative_dose_msv']} mSv", body))
        story.append(Paragraph(f"Risk indicators (heuristic): {top_risks}", body))
        for insight in member["insights"][:3]:
            story.append(Paragraph(
                f"• [{insight['severity']}/{insight['data_class']}] {insight['title']}: {insight['summary']}", small))
        story.append(Spacer(1, 5))

    if payload["incidents"]:
        story.append(Paragraph("Alerts and incidents", h2))
        data = [["ID", "Severity", "Status", "Title"]] + [
            [str(i["id"]), i["severity"], i["status"], i["title"][:70]] for i in payload["incidents"][:20]
        ]
        table = Table(data, colWidths=[14 * mm, 22 * mm, 30 * mm, 100 * mm])
        table.setStyle(TableStyle([
            ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8),
            ("FONT", (0, 1), (-1, -1), "Helvetica", 7.5),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#c8c6c0")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        story.append(table)

    if payload["interventions"]:
        story.append(Paragraph("Interventions", h2))
        for i in payload["interventions"]:
            story.append(Paragraph(f"• {i['category']} — {i['description']} ({i['outcome']})", small))

    story.append(Paragraph("Limitations and uncertainty", h2))
    for line in payload["limitations"]:
        story.append(Paragraph(f"• {line}", small))
    story.append(Paragraph("Scientific sources", h2))
    for line in payload["sources"]:
        story.append(Paragraph(f"• {line}", small))

    doc.build(story)
    buf.seek(0)
    audit(db, user, "report.export_pdf", "mission", mission.id, "", request)
    filename = f"cosmicare-{mission.code.lower()}-report.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
