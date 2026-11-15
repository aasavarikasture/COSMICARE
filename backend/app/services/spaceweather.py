"""Optional space-weather observation client.

Distinguishes clearly between:
  1. observed space-weather measurements (e.g. NOAA planetary K index),
  2. solar-event forecasts,
  3. modelled/simulated astronaut dose.
A forecast never becomes an astronaut dose measurement.
"""
from __future__ import annotations

import time

import httpx

from ..config import settings

_cache: dict[str, tuple[float, dict]] = {}
CACHE_SECONDS = 900


def _kp_severity(kp: float) -> str:
    if kp >= 7:
        return "severe"
    if kp >= 5:
        return "moderate"
    return "quiet"


def planetary_k_index() -> dict:
    """Fetch the latest NOAA SWPC planetary K index (observed, external)."""
    now = time.time()
    cached = _cache.get("kp")
    if cached and now - cached[0] < CACHE_SECONDS:
        return cached[1]

    if not settings.space_weather_enabled:
        return {
            "available": False,
            "reason": "Space-weather ingestion disabled by configuration.",
            "data_class": "external_observation",
        }
    try:
        with httpx.Client(timeout=settings.space_weather_timeout) as client:
            res = client.get(settings.space_weather_url)
            res.raise_for_status()
            rows = res.json()
        header, *data = rows
        latest = data[-1]
        idx = {name: i for i, name in enumerate(header)}
        kp = float(latest[idx.get("Kp", 1)])
        payload = {
            "available": True,
            "source": "NOAA SWPC planetary K index",
            "source_url": "https://www.swpc.noaa.gov/products/planetary-k-index",
            "observed_at": latest[idx.get("time_tag", 0)],
            "kp_index": kp,
            "severity": _kp_severity(kp),
            "data_class": "external_observation",
            "interpretation": "Geomagnetic activity affects high-latitude and LEO radiation environments. It is not an astronaut dose reading.",
            "history": [
                {
                    "observed_at": row[idx.get("time_tag", 0)],
                    "kp_index": float(row[idx.get("Kp", 1)]),
                }
                for row in data[-24:]
            ],
        }
        _cache["kp"] = (now, payload)
        return payload
    except Exception as exc:  # network unavailable must not break the app
        payload = {
            "available": False,
            "reason": f"Space-weather source unreachable ({type(exc).__name__}). Showing modelled data only.",
            "source": "NOAA SWPC",
            "source_url": "https://www.swpc.noaa.gov/products/planetary-k-index",
            "data_class": "external_observation",
        }
        _cache["kp"] = (now, payload)
        return payload
