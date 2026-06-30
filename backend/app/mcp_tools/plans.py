"""MCP tools: write_plan / update_plan_status — mitigation_plans (M4)."""
from __future__ import annotations

from datetime import datetime, timezone

from app.config import settings
from app.db.mongo import col


def write_plan(thread_id: str, plan: dict) -> str:
    doc = dict(plan)
    doc["thread_id"] = thread_id
    doc["created_at"] = datetime.now(timezone.utc)
    doc.setdefault("status", "PROPOSED")
    col(settings.COL_PLANS).insert_one(doc)
    return doc["plan_id"]


def update_plan_status(plan_id: str, status: str) -> bool:
    res = col(settings.COL_PLANS).update_one(
        {"plan_id": plan_id}, {"$set": {"status": status,
                                        "updated_at": datetime.now(timezone.utc)}})
    return res.modified_count > 0


def get_plans(thread_id: str) -> list[dict]:
    return list(col(settings.COL_PLANS).find({"thread_id": thread_id}, {"_id": 0}))
