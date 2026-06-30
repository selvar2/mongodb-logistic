"""Run the LangGraph workflow — synchronous run + async start with SSE streaming."""
from __future__ import annotations

import asyncio
import json
import threading
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from app.agents.graph import run_workflow
from app.config import settings
from app.db.mongo import col
from app.mcp_tools import audit, checkpoints, plans

router = APIRouter(tags=["workflow"])

# in-memory registry of background runs (thread_id -> {"status","state"})
_RUNS: dict[str, dict] = {}


class RunIn(BaseModel):
    alert_text: Optional[str] = None
    disruption_id: Optional[str] = None


def _resolve_alert(body: RunIn) -> str:
    if body.disruption_id:
        d = col(settings.COL_DISRUPTIONS).find_one({"_id": body.disruption_id})
        if not d:
            raise HTTPException(404, "disruption not found")
        return d["alert_text"]
    if body.alert_text:
        return body.alert_text
    raise HTTPException(422, "provide alert_text or disruption_id")


def _json_safe(obj):
    return json.loads(json.dumps(obj, default=str))


@router.post("/workflow/run")
def run_sync(body: RunIn) -> dict:
    """Run synchronously and return the full final state (few seconds)."""
    alert = _resolve_alert(body)
    thread_id = "run-" + uuid.uuid4().hex[:10]
    final = run_workflow(alert, thread_id=thread_id)
    return _json_safe(final)


@router.post("/workflow/start")
def start_async(body: RunIn) -> dict:
    """Start a background run; stream progress via /workflow/stream/{thread_id}."""
    alert = _resolve_alert(body)
    thread_id = "run-" + uuid.uuid4().hex[:10]
    _RUNS[thread_id] = {"status": "running", "state": None}

    def _worker():
        try:
            final = run_workflow(alert, thread_id=thread_id)
            _RUNS[thread_id] = {"status": "complete", "state": _json_safe(final)}
        except Exception as exc:  # record failure for the stream/result endpoints
            _RUNS[thread_id] = {"status": "error", "error": str(exc)}

    threading.Thread(target=_worker, daemon=True).start()
    return {"thread_id": thread_id, "status": "running"}


class DecisionIn(BaseModel):
    thread_id: str
    decision: str  # approved | rejected
    comment: Optional[str] = None


@router.post("/workflow/decision")
def decision(body: DecisionIn) -> dict:
    """Record a human-in-the-loop decision for a HUMAN_REVIEW plan.

    Approval needs no comment; rejection requires feedback. The decision is
    written to audit_logs and the mitigation plan's status is updated.
    """
    if body.decision not in ("approved", "rejected"):
        raise HTTPException(422, "decision must be 'approved' or 'rejected'")
    comment = (body.comment or "").strip()
    if body.decision == "rejected" and not comment:
        raise HTTPException(422, "rejection requires a comment")

    audit.log(
        body.thread_id, agent="human_reviewer", action="hitl_decision",
        input_summary=comment,
        output_summary=f"decision={body.decision}",
        level="warn" if body.decision == "rejected" else "info",
    )
    updated = col(settings.COL_PLANS).update_one(
        {"thread_id": body.thread_id},
        {"$set": {"status": body.decision, "review_comment": comment,
                  "reviewed_at": datetime.now(timezone.utc)}},
    ).modified_count
    return {"ok": True, "thread_id": body.thread_id,
            "decision": body.decision, "plan_updated": bool(updated)}


@router.get("/workflow/result/{thread_id}")
def result(thread_id: str) -> dict:
    run = _RUNS.get(thread_id)
    if run and run.get("state"):
        return run["state"]
    # fall back to the last checkpoint persisted in Mongo
    state = checkpoints.read_checkpoint(thread_id)
    if state:
        return _json_safe(state)
    raise HTTPException(404, "no result for thread")


@router.get("/workflow/stream/{thread_id}")
async def stream(thread_id: str, request: Request):
    """SSE: emit each audit-log step for the thread as the workflow progresses."""
    async def event_gen():
        seen = 0
        waited = 0.0
        while True:
            if await request.is_disconnected():
                break
            logs = list(col(settings.COL_AUDIT)
                        .find({"thread_id": thread_id}).sort("ts", 1))
            for entry in logs[seen:]:
                yield {"event": "step", "data": json.dumps({
                    "agent": entry.get("agent"),
                    "action": entry.get("action"),
                    "summary": entry.get("output_summary"),
                    "level": entry.get("level", "info"),
                    "ts": (entry.get("ts") or datetime.now(timezone.utc)).isoformat(),
                })}
            seen = len(logs)
            run = _RUNS.get(thread_id, {})
            ended = any(l.get("action") == "workflow_end" for l in logs)
            if ended or run.get("status") in ("complete", "error"):
                final = run.get("state") or _json_safe(
                    checkpoints.read_checkpoint(thread_id) or {})
                yield {"event": "done", "data": json.dumps(final)}
                break
            waited += 0.5
            if waited > 60:  # safety timeout
                yield {"event": "done", "data": json.dumps({"timeout": True})}
                break
            await asyncio.sleep(0.5)

    return EventSourceResponse(event_gen())


@router.get("/plans/{thread_id}")
def get_plans(thread_id: str) -> dict:
    items = plans.get_plans(thread_id)
    return {"count": len(items), "items": _json_safe(items)}


@router.get("/checkpoints/{thread_id}")
def get_checkpoints(thread_id: str) -> dict:
    items = checkpoints.history(thread_id)
    return {"count": len(items), "items": _json_safe(items)}
