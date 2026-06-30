"""MCP tools: read_checkpoint / write_checkpoint — LangGraph thread memory (M4)."""
from __future__ import annotations

from datetime import datetime, timezone

from app.config import settings
from app.db.mongo import col


def write_checkpoint(thread_id: str, node: str, state: dict) -> None:
    col(settings.COL_CHECKPOINTS).insert_one({
        "thread_id": thread_id,
        "ts": datetime.now(timezone.utc),
        "node": node,
        "state": _safe(state),
    })


def read_checkpoint(thread_id: str) -> dict | None:
    doc = col(settings.COL_CHECKPOINTS).find_one(
        {"thread_id": thread_id}, sort=[("ts", -1)])
    return doc["state"] if doc else None


def history(thread_id: str) -> list[dict]:
    return list(col(settings.COL_CHECKPOINTS).find(
        {"thread_id": thread_id}, {"_id": 0}).sort("ts", 1))


def _safe(state: dict) -> dict:
    """Strip non-serializable values for storage."""
    import json
    return json.loads(json.dumps(state, default=str))
