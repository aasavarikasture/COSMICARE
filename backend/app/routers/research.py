"""NASA research integration: dataset registry, transparent import and analysis.

No NASA data is fabricated. Seeded entries are explicitly marked ``is_sample`` and
describe illustrative demonstration values; the registry links to the real public
portals and supports importing a real CSV export.
"""
from __future__ import annotations

import csv
import hashlib
import io
import statistics

from sqlalchemy.exc import IntegrityError

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

import os
from datetime import datetime, timezone

from ..database import get_db
from ..models import ResearchDataset, User
from ..schemas import ResearchAnalysisIn, ResearchImportIn
from ..security import audit, get_current_user, require_roles


def utcnow() -> datetime:
    return datetime.now(timezone.utc)

router = APIRouter(prefix="/api/research", tags=["research"])

SOURCES = [
    {
        "name": "NASA Open Science Data Repository (OSDR)",
        "url": "https://osdr.nasa.gov/bio/repo/",
        "note": "Public repository of spaceflight and space-relevant omics and phenotype data. Browse studies and import an aggregated CSV export.",
        "access": "Public web portal; dataset-specific licences and usage terms apply.",
    },
    {
        "name": "NASA GeneLab",
        "url": "https://genelab.nasa.gov/",
        "note": "Omics data from spaceflight experiments, now integrated into OSDR.",
        "access": "Public; study-specific metadata and protocols.",
    },
    {
        "name": "NASA Human Research Program (HRP) evidence base",
        "url": "https://humanresearchroadmap.nasa.gov/",
        "note": "Human health and performance risks, evidence and countermeasures used for contextual explanations.",
        "access": "Public reference material; not a dataset API.",
    },
    {
        "name": "NASA Space Weather / CCMC",
        "url": "https://ccmc.gsfc.nasa.gov/",
        "note": "Space-weather modelling context. Not an astronaut dosimetry source.",
        "access": "Public.",
    },
    {
        "name": "NOAA SWPC planetary K index",
        "url": "https://www.swpc.noaa.gov/products/planetary-k-index",
        "note": "Live geomagnetic activity observation used in the radiation module.",
        "access": "Public JSON endpoint.",
    },
]

SAMPLE_DATASETS = [
    {
        "title": "Illustrative bone mineral density change during long-duration unloading",
        "identifier": "COSMICARE-SAMPLE-BMD-001",
        "source": "COSMICARE demonstration sample (not an official NASA dataset)",
        "source_url": "https://osdr.nasa.gov/bio/repo/",
        "license": "CC0-1.0 (sample values created for this demonstration)",
        "modality": "Aggregated phenotype (illustrative)",
        "description": "Synthetic monthly BMD change percentages shaped after published descriptions of spaceflight bone loss. Values are invented for demonstration and must not be cited as NASA data.",
        "indicators": ["bone_density_change_pct"],
        "preprocessing": "Monthly percentage change aggregated; no subject identifiers retained.",
        "analysis": {
            "series": [
                {"month": 0, "change_pct": 0.0},
                {"month": 1, "change_pct": -1.1},
                {"month": 2, "change_pct": -2.0},
                {"month": 3, "change_pct": -2.9},
                {"month": 4, "change_pct": -3.6},
                {"month": 5, "change_pct": -4.1},
                {"month": 6, "change_pct": -4.5},
            ],
            "note": "Illustrative trend only; not a measured dataset.",
            "data_class": "sample",
        },
    },
    {
        "title": "Illustrative sleep duration during orbital missions",
        "identifier": "COSMICARE-SAMPLE-SLEEP-002",
        "source": "COSMICARE demonstration sample (not an official NASA dataset)",
        "source_url": "https://humanresearchroadmap.nasa.gov/",
        "license": "CC0-1.0 (sample values created for this demonstration)",
        "modality": "Aggregated actigraphy summary (illustrative)",
        "description": "Synthetic sleep-duration distribution for demonstration of the research panel. Not derived from an actual crew dataset.",
        "indicators": ["sleep_hours"],
        "preprocessing": "Daily totals aggregated across a hypothetical 12-person sample.",
        "analysis": {
            "series": [
                {"bin": "4.5-5.5", "count": 8},
                {"bin": "5.5-6.5", "count": 26},
                {"bin": "6.5-7.5", "count": 41},
                {"bin": "7.5-8.5", "count": 22},
                {"bin": "8.5-9.5", "count": 5},
            ],
            "note": "Illustrative distribution only.",
            "data_class": "sample",
        },
    },
]

NASA_DATASETS = [
    {
        "title": "Lumbar spine DXA microstructure in hindlimb-suspended mice (OSD-661)",
        "identifier": "NASA-OSDR-OSD-661-LSDS-69",
        "source": "NASA Open Science Data Repository (OSDR) — OSD-661",
        "source_url": "https://osdr.nasa.gov/bio/repo/data/studies/OSD-661",
        "license": "CC0-1.0 (NASA OSDR public license, as published by the study)",
        "modality": "Murine bone microstructure — dual-energy X-ray absorptiometry (DXA), lumbar spine",
        "description": (
            "Genuine NASA OSDR dataset OSD-661 (LSDS-69): dual-energy X-ray absorptiometry (DXA) "
            "measurements of the lumbar spine in mice subjected to hindlimb suspension (HLS) as a "
            "ground-based model of microgravity. The import below loads a transformed tabular export "
            "from the NASA OSDR data manager and computes summary statistics by genotype group. "
            "OSD-661 examines GSK3-related mechanisms of muscle and bone loss across several spaceflight "
            "and hindlimb-unloading missions; this lumbar-spine DXA export is one component of that study. "
            "COSMICARE presents a small curated subset for research context only and is not an official NASA product."
        ),
        "indicators": [
            "baseline_regional_bmd",
            "post_hls_regional_bmd",
            "post_hls_bmd_change_pct",
            "body_fat_percent",
            "lean_mass_percent",
        ],
        "preprocessing": (
            "Original file: LSDS-69_Bone_microstructure_DXA_spine_TRANSFORMED.csv from OSDR study OSD-661 "
            "(downloaded via the NASA OSDR data manager export). COSMICARE imports only the aggregate "
            "computed columns it stores for display: per-row post-HLS BMD change percent from the original "
            "baseline_regional_BMD and post-HLS_regional_BMD fields; group means and missingness derived "
            "from the same source fields. No subject-level identifiers are used beyond the genotype label "
            "already present in the public export (\"Flox_HLS\" / \"KD_HLS\" / \"...\" groups)."
        ),
        "record_count": 0,
        "is_sample": False,
        "analysis": {
            "data_class": "nasa_osdr_imported",
            "validation_status": "parsed",
            "limitation": (
                "This dataset is a murine hindlimb-suspension model, not a direct human spaceflight "
                "measurement. It is included as publicly available NASA-hosted research context. "
                "COSMICARE has not independently validated the original assay or the study design."
            ),
            "source_files": [
                {
                    "original_filename": "LSDS-69_Bone_microstructure_DXA_spine_TRANSFORMED.csv",
                    "study_accession": "OSD-661",
                    "alsda_id": "LSDS-69",
                    "local_path": "backend/data/nasa/OSD-661_LSDS-69_Bone_microstructure_DXA_spine_TRANSFORMED.csv",
                }
            ],
            "imported_at": "",
            "variables": [
                {"name": "Sample Name", "role": "group label", "unit": "", "notes": "Genotype / HLS group label from the public export."},
                {"name": "body_fat_percent", "role": "phenotype", "unit": "percent", "notes": "Body fat percentage from the original DXA export."},
                {"name": "lean_mass_percent", "role": "phenotype", "unit": "percent", "notes": "Lean mass percentage from the original DXA export."},
                {"name": "baseline_regional_BMD", "role": "measurement", "unit": "g/cm\u00b2 (as published)", "notes": "Baseline regional bone mineral density; units as provided by the study export."},
                {"name": "post-HLS_regional_BMD", "role": "measurement", "unit": "g/cm\u00b2 (as published)", "notes": "Post-hindlimb-suspension regional bone mineral density; units as provided by the study export."},
                {"name": "post_hls_bmd_change_pct", "role": "derived", "unit": "percent", "notes": "Computed by COSMICARE as (post-HLS - baseline) / baseline * 100. Only rows with both source values present."},
            ],
        },
        "csv_source": {
            "filename": "LSDS-69_Bone_microstructure_DXA_spine_TRANSFORMED.csv",
            "study_accession": "OSD-661",
            "alsda_id": "LSDS-69",
            "relative_path": "backend/data/nasa/OSD-661_LSDS-69_Bone_microstructure_DXA_spine_TRANSFORMED.csv",
            "source_url": "https://osdr.nasa.gov/bio/repo/data/studies/OSD-661",
        },
    },
]


def _dataset_out(d: ResearchDataset) -> dict:
    return {
        "id": d.id,
        "title": d.title,
        "identifier": d.identifier,
        "source": d.source,
        "source_url": d.source_url,
        "license": d.license,
        "modality": d.modality,
        "description": d.description,
        "indicators": d.indicators,
        "preprocessing": d.preprocessing,
        "record_count": d.record_count,
        "is_sample": d.is_sample,
        "analysis": d.analysis,
        "created_at": d.created_at.isoformat(),
        "attribution_note": (
            "Sample dataset created for COSMICARE. Not an official NASA dataset and not endorsed by NASA."
            if d.is_sample
            else "Imported by the user; attribution follows the original source metadata."
        ),
    }


def _load_nasa_osd661_analysis(*, csv_path: str) -> dict:
    import csv as _csv
    from collections import defaultdict

    rows: list[dict[str, str]] = []
    with open(csv_path, newline="", encoding="utf-8-sig") as fh:
        reader = _csv.DictReader(fh)
        fieldnames = reader.fieldnames or []
        for row in reader:
            rows.append({k: (v or "").strip() for k, v in row.items()})

    baseline_key = "baseline_regional_BMD"
    post_key = "post-HLS_regional_BMD"
    derived_rows: list[dict[str, object]] = []
    missing_before = 0
    missing_after = 0
    invalid_before = 0
    invalid_after = 0
    group_values: dict[str, list[float]] = defaultdict(list)
    body_fat: list[float] = []
    lean_mass: list[float] = []

    for row in rows:
        b_raw = row.get(baseline_key, "")
        p_raw = row.get(post_key, "")
        try:
            b = float(b_raw) if b_raw not in ("", "NA", "N/A", "nan") else None
        except (TypeError, ValueError):
            b = None
            invalid_before += 1
        try:
            p = float(p_raw) if p_raw not in ("", "NA", "N/A", "nan") else None
        except (TypeError, ValueError):
            p = None
            invalid_after += 1

        if b is None and b_raw:
            missing_before += 1
        if p is None and p_raw:
            missing_after += 1

        if b is None or p is None:
            continue
        if b == 0:
            continue

        change_pct = round((p - b) / b * 100, 2)
        derived_rows.append({
            "group": (row.get("Sample Name") or "unknown").strip(),
            "baseline_regional_bmd": b,
            "post_hls_regional_bmd": p,
            "post_hls_bmd_change_pct": change_pct,
        })

        group_values[row.get("Sample Name", "").strip() or "unknown"].append(change_pct)

        bf = row.get("body_fat_percent", "")
        lm = row.get("lean_mass_percent", "")
        if bf:
            try:
                body_fat.append(float(bf))
            except (TypeError, ValueError):
                pass
        if lm:
            try:
                lean_mass.append(float(lm))
            except (TypeError, ValueError):
                pass

    def summary(vals: list[float]) -> dict:
        if not vals:
            return {"n": 0, "mean": None, "median": None, "sd": None, "min": None, "max": None}
        import statistics as _stats
        return {
            "n": len(vals),
            "mean": round(_stats.mean(vals), 2),
            "median": round(_stats.median(vals), 2),
            "sd": round(_stats.pstdev(vals), 2),
            "min": round(min(vals), 2),
            "max": round(max(vals), 2),
        }

    group_summary = {g: summary(v) for g, v in group_values.items()}
    overall_change = summary([r["post_hls_bmd_change_pct"] for r in derived_rows])

    return {
        "data_class": "nasa_osdr_imported",
        "validation_status": "parsed",
        "limitation": (
            "This dataset is a murine hindlimb-suspension model, not a direct human spaceflight "
            "measurement. It is included as publicly available NASA-hosted research context. "
            "COSMICARE has not independently validated the original assay or study design."
        ),
        "source_files": [
            {
                "original_filename": "LSDS-69_Bone_microstructure_DXA_spine_TRANSFORMED.csv",
                "study_accession": "OSD-661",
                "alsda_id": "LSDS-69",
                "local_path": csv_path,
            }
        ],
        "imported_at": "",
        "variables": [
            {"name": "Sample Name", "role": "group label", "unit": "", "notes": "Genotype / HLS group label from the public export."},
            {"name": "body_fat_percent", "role": "phenotype", "unit": "percent", "notes": "Body fat percentage from the original DXA export."},
            {"name": "lean_mass_percent", "role": "phenotype", "unit": "percent", "notes": "Lean mass percentage from the original DXA export."},
            {"name": "baseline_regional_BMD", "role": "measurement", "unit": "g/cm\u00b2 (as published)", "notes": "Baseline regional bone mineral density; units as provided by the study export."},
            {"name": "post-HLS_regional_BMD", "role": "measurement", "unit": "g/cm\u00b2 (as published)", "notes": "Post-hindlimb-suspension regional bone mineral density; units as provided by the study export."},
            {"name": "post_hls_bmd_change_pct", "role": "derived", "unit": "percent", "notes": "Computed by COSMICARE as (post-HLS - baseline) / baseline * 100. Only rows with both source values present."},
        ],
        "series": [{"group": g, "mean_change_pct": s["mean"], "median_change_pct": s["median"], "n": s["n"]} for g, s in group_summary.items()],
        "summary": {
            "overall_post_hls_bmd_change_pct": overall_change,
            "group_post_hls_bmd_change_pct": group_summary,
            "body_fat_percent": summary(body_fat),
            "lean_mass_percent": summary(lean_mass),
            "raw_rows": rows,
        },
        "missing_values": {
            "baseline_regional_BMD_missing": missing_before,
            "post_hls_regional_bMD_missing": missing_after,
            "invalid_baseline_regional_BMD": invalid_before,
            "invalid_post_hls_regional_BMD": invalid_after,
            "rows_with_both_values": len(derived_rows),
            "rows_total": len(rows),
        },
        "note": (
            "Derived from NASA OSDR study OSD-661 (LSDS-69) lumbar spine DXA transformed export. "
            "Change percent is computed only for rows where both baseline and post-HLS values are present; "
            "missing/invalid values are excluded from computed summaries."
        ),
    }


def ensure_sample_datasets(db: Session) -> None:
    if db.scalar(select(ResearchDataset).where(ResearchDataset.is_sample.is_(True))):
        ensure_nasa_datasets(db)
        return
    for item in SAMPLE_DATASETS:
        db.add(
            ResearchDataset(
                title=item["title"],
                identifier=item["identifier"],
                source=item["source"],
                source_url=item["source_url"],
                license=item["license"],
                modality=item["modality"],
                description=item["description"],
                indicators=item["indicators"],
                preprocessing=item["preprocessing"],
                record_count=len((item["analysis"] or {}).get("series", [])),
                is_sample=True,
                analysis=item["analysis"],
            )
        )
    db.commit()
    try:
        ensure_nasa_datasets(db)
    except HTTPException:
        db.rollback()
        raise


def ensure_nasa_datasets(db: Session) -> None:
    if db.scalar(select(ResearchDataset).where(ResearchDataset.identifier == "NASA-OSDR-OSD-661-LSDS-69")):
        return
    candidate_paths = [
        os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "data",
            "nasa",
            "OSD-661_LSDS-69_Bone_microstructure_DXA_spine_TRANSFORMED.csv",
        ),
        os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            "backend",
            "data",
            "nasa",
            "OSD-661_LSDS-69_Bone_microstructure_DXA_spine_TRANSFORMED.csv",
        ),
    ]
    csv_path = next((p for p in candidate_paths if os.path.exists(p)), None)
    if csv_path is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "NASA OSD-661 source file not found. Ensure backend/data/nasa/*.csv exists.",
        )
    analysis = _load_nasa_osd661_analysis(csv_path=csv_path)
    analysis["imported_at"] = utcnow().isoformat()
    nasa = NASA_DATASETS[0]
    db.add(
        ResearchDataset(
            title=nasa["title"],
            identifier=nasa["identifier"],
            source=nasa["source"],
            source_url=nasa["source_url"],
            license=nasa["license"],
            modality=nasa["modality"],
            description=nasa["description"],
            indicators=nasa["indicators"],
            preprocessing=nasa["preprocessing"],
            record_count=analysis["missing_values"]["rows_total"],
            is_sample=False,
            analysis=analysis,
        )
    )
    db.commit()


@router.get("/sources")
def sources(user: User = Depends(get_current_user)):
    return {
        "sources": SOURCES,
        "note": "NASA does not endorse COSMICARE. Research references are used for context and model development only.",
    }


@router.get("/datasets")
def datasets(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ensure_sample_datasets(db)
    rows = list(db.scalars(select(ResearchDataset).order_by(ResearchDataset.created_at)).all())
    return {"datasets": [_dataset_out(d) for d in rows]}


@router.post("/import", status_code=201)
def import_metadata(
    payload: ResearchImportIn,
    request: Request,
    user: User = Depends(require_roles("medical", "admin")),
    db: Session = Depends(get_db),
):
    if db.scalar(select(ResearchDataset).where(ResearchDataset.identifier == payload.identifier)):
        raise HTTPException(status.HTTP_409_CONFLICT, "A dataset with this identifier already exists")
    dataset = ResearchDataset(**payload.model_dump(), imported_by=user.id)
    db.add(dataset)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "A dataset with this identifier already exists")
    audit(db, user, "research.import", "research_dataset", dataset.id, payload.identifier, request)
    return _dataset_out(dataset)


@router.post("/import/csv", status_code=201)
async def import_csv(
    request: Request,
    file: UploadFile = File(...),
    title: str = "Imported CSV dataset",
    source: str = "User-provided research export",
    source_url: str = "",
    license: str = "",
    user: User = Depends(require_roles("medical", "admin")),
    db: Session = Depends(get_db),
):
    """Import an aggregated metric CSV with columns: metric,value[,group].

    No row-level personal data should be uploaded. Only aggregate summaries are
    retained by COSMICARE.
    """
    raw = await file.read()
    if len(raw) > 2_000_000:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File too large (max 2 MB)")
    try:
        text = raw.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        rows = []
        skipped = 0
        row_no = 1
        for row in reader:
            row_no += 1
            metric = (row.get("metric") or "").strip()
            value_raw = row.get("value")
            if not metric or value_raw in (None, ""):
                skipped += 1
                continue
            try:
                value = float(str(value_raw).strip())
            except (TypeError, ValueError):
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Invalid numeric value in row {row_no}: {value_raw!r}")
            group = (row.get("group") or "").strip()
            unit = (row.get("unit") or "").strip()
            rows.append({"metric": metric, "value": value, "group": group, "unit": unit})
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Could not parse CSV. Expect columns: metric,value[,group]")
    if not rows:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No valid rows found")

    groups: dict[str, list[float]] = {}
    units = sorted({r["unit"] for r in rows if r.get("unit")})
    for r in rows:
        groups.setdefault(r["group"] or "all" if r["group"] else "all", []).append(r["value"])
    summary = {
        group: {
            "n": len(vals),
            "mean": round(statistics.fmean(vals), 3),
            "median": round(statistics.median(vals), 3),
            "sd": round(statistics.pstdev(vals), 3) if len(vals) > 1 else 0.0,
            "min": round(min(vals), 3),
            "max": round(max(vals), 3),
        }
        for group, vals in groups.items()
    }
    identifier = f"IMPORT-{hashlib.sha256(raw).hexdigest()[:12].upper()}"
    if db.scalar(select(ResearchDataset).where(ResearchDataset.identifier == identifier)):
        raise HTTPException(status.HTTP_409_CONFLICT, "A dataset with this identifier already exists")
    dataset = ResearchDataset(
        title=title,
        identifier=identifier,
        source=source,
        source_url=source_url,
        license=license,
        modality="User-imported aggregated CSV",
        description=f"Aggregated import from {file.filename or 'upload.csv'}; {len(rows)} rows ({skipped} skipped).",
        indicators=sorted({r['metric'] for r in rows}),
        preprocessing="Validated metric/value pairs; aggregated summary computed; raw rows are not stored.",
        record_count=len(rows),
        is_sample=False,
        imported_by=user.id,
        analysis={
            "summary": summary,
            "metrics": sorted({r['metric'] for r in rows}),
            "units": units,
            "skipped_rows": skipped,
            "data_class": "imported_research",
            "validation_status": "parsed",
            "limitation": "Import quality depends on the original source; COSMICARE has not validated it.",
        },
    )
    db.add(dataset)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "A dataset with this identifier already exists")
    audit(db, user, "research.import_csv", "research_dataset", dataset.id, identifier, request)
    return _dataset_out(dataset)


@router.get("/analysis")
def analysis(
    dataset_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dataset = db.get(ResearchDataset, dataset_id)
    if not dataset:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dataset not found")
    return {
        "dataset": _dataset_out(dataset),
        "analysis": dataset.analysis,
        "relevance": {
            "bone_density_change_pct": "Supports the bone module's explanation of expected loss trajectories (context only).",
            "sleep_hours": "Supports sleep-monitoring context and non-diagnostic recommendations.",
        },
        "limitations": [
            "Research datasets are historical and aggregated; they are never treated as live astronaut telemetry.",
            "Sample datasets in this build are illustrative and must not be cited as NASA findings.",
            "No causal claims are made from correlation with individual crew data.",
        ],
    }
