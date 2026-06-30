"""Audit + console logging. Every agent decision lands in `audit_logs`."""
from __future__ import annotations

from datetime import datetime, timezone

from app.config import settings
from app.db.mongo import col


def log(thread_id: str, agent: str, action: str,
        input_summary: str = "", output_summary: str = "",
        level: str = "info") -> None:
    doc = {
        "ts": datetime.now(timezone.utc),
        "thread_id": thread_id,
        "agent": agent,
        "action": action,
        "input_summary": input_summary[:500],
        "output_summary": output_summary[:1000],
        "level": level,
    }
    try:
        col(settings.COL_AUDIT).insert_one(doc)
    except Exception as exc:  # never let logging break the workflow
        print(f"[audit-log-error] {exc}")
    print(f"  [{agent}] {action} :: {output_summary[:120]}")
