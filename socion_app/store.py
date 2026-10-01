"""
store.py — report persistence and cost/usage logging.

A JSON-file-backed store, not a real database. Good enough to make the
tier-gating and entitlement logic real and testable; explicitly NOT good
enough for production (no concurrent-write safety beyond a single process
lock, no indexing, flat file grows forever). Swap for Postgres/SQLite
before launch — the interface below (get/create/update/grant) is written
so that swap doesn't touch server.py.
"""

from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

DATA_DIR = Path(__file__).parent / "data"
REPORTS_PATH = DATA_DIR / "reports.json"
USAGE_LOG_PATH = DATA_DIR / "usage_log.jsonl"

_lock = threading.Lock()

Entitlement = Literal["free", "paid", "verified"]
_ENTITLEMENT_RANK = {"free": 0, "paid": 1, "verified": 2}


def _ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not REPORTS_PATH.exists():
        REPORTS_PATH.write_text("{}", encoding="utf-8")


def _load_all() -> dict[str, Any]:
    _ensure_data_dir()
    try:
        return json.loads(REPORTS_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def _save_all(data: dict[str, Any]) -> None:
    REPORTS_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def create_report(answers: dict[str, str], result: dict) -> str:
    """Stores a freshly-generated (always full, never pre-filtered) report.
    Returns the report_id the client will use for /result and checkout."""
    report_id = uuid.uuid4().hex[:16]
    with _lock:
        data = _load_all()
        data[report_id] = {
            "id": report_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "answers": answers,
            "report": result["report"],
            "model": result.get("model"),
            "entitlement": "free",
        }
        _save_all(data)
    return report_id


def get_record(report_id: str) -> dict | None:
    with _lock:
        data = _load_all()
        return data.get(report_id)


def grant_entitlement(report_id: str, tier: Entitlement) -> bool:
    """Marks a report entitled to a tier. Only moves entitlement UP — never
    silently downgrades a report that was already granted a higher tier."""
    with _lock:
        data = _load_all()
        record = data.get(report_id)
        if record is None:
            return False
        current = record.get("entitlement", "free")
        if _ENTITLEMENT_RANK[tier] > _ENTITLEMENT_RANK[current]:
            record["entitlement"] = tier
            data[report_id] = record
            _save_all(data)
        return True


def update_report(report_id: str, report: dict) -> bool:
    """Replaces the stored report body (used after the $100 verified debate
    pass runs and produces a richer merged report)."""
    with _lock:
        data = _load_all()
        record = data.get(report_id)
        if record is None:
            return False
        record["report"] = report
        data[report_id] = record
        _save_all(data)
    return True


def update_fields(report_id: str, **fields: Any) -> bool:
    with _lock:
        data = _load_all()
        record = data.get(report_id)
        if record is None:
            return False
        record.update(fields)
        data[report_id] = record
        _save_all(data)
    return True


def log_usage(*, report_id: str, tier: str, model: str, usage: dict, cost_usd: float) -> None:
    """Append-only usage/cost log. One line per generation pass (a single
    Typist call, or a full Typist->Skeptic->Synthesizer run), so margin per
    report can be computed later: group by tier, sum cost_usd."""
    _ensure_data_dir()
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "report_id": report_id,
        "tier": tier,
        "model": model,
        "input_tokens": usage.get("input_tokens", 0),
        "cache_read_input_tokens": usage.get("cache_read_input_tokens", 0),
        "cache_creation_input_tokens": usage.get("cache_creation_input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
        "estimated_cost_usd": round(cost_usd, 6),
    }
    with _lock:
        with USAGE_LOG_PATH.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
