"""Observability endpoint — live LangSmith stats + MongoDB audit/checkpoint data.

LangSmith is queried server-side (the API key never reaches the browser). Any
LangSmith failure degrades gracefully so the page always renders the audit data.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter

from app.config import settings
from app.db.mongo import col

router = APIRouter(tags=["observability"])


def _ui_url() -> str:
    """Derive the LangSmith UI host from the API endpoint."""
    ep = settings.langchain_endpoint
    if "aws.api.smith" in ep:
        return "https://aws.smith.langchain.com"
    if "eu.api.smith" in ep:
        return "https://eu.smith.langchain.com"
    return "https://smith.langchain.com"


def _langsmith() -> dict:
    if settings.langchain_tracing != "true" or not settings.langchain_api_key:
        return {"configured": False, "reason": "tracing disabled or no API key"}
    try:
        from langsmith import Client
        client = Client(api_url=settings.langchain_endpoint,
                        api_key=settings.langchain_api_key)

        # resolve the exact project page URL (tenant id + project id)
        project_url = _ui_url()
        try:
            proj = client.read_project(project_name=settings.langchain_project)
            tenant, pid = getattr(proj, "tenant_id", None), getattr(proj, "id", None)
            if tenant and pid:
                project_url = f"{_ui_url()}/o/{tenant}/projects/p/{pid}"
        except Exception:
            pass

        runs = list(client.list_runs(project_name=settings.langchain_project, limit=25))
        recent, latencies, success, error = [], [], 0, 0
        for r in runs:
            ok = (r.status or "").lower() == "success"
            success += 1 if ok else 0
            error += 0 if ok else 1
            lat = None
            if r.start_time and r.end_time:
                lat = round((r.end_time - r.start_time).total_seconds() * 1000)
                latencies.append(lat)
            recent.append({
                "name": (r.name or "")[:48],
                "run_type": r.run_type,
                "status": r.status,
                "latency_ms": lat,
                "start": r.start_time.isoformat() if r.start_time else None,
            })
        total = len(runs)
        return {
            "configured": True,
            "project": settings.langchain_project,
            "endpoint": settings.langchain_endpoint,
            "ui_url": _ui_url(),
            "project_url": project_url,
            "total_runs": total,
            "success": success,
            "error": error,
            "success_rate": round(100 * success / total) if total else None,
            "avg_latency_ms": round(sum(latencies) / len(latencies)) if latencies else None,
            "last_run": recent[0]["start"] if recent else None,
            "recent": recent,
        }
    except Exception as exc:  # graceful degrade
        return {"configured": True, "reachable": False, "error": str(exc)[:200],
                "ui_url": _ui_url(), "project": settings.langchain_project}


def _audit() -> dict:
    audit = col(settings.COL_AUDIT)
    by_agent = {d["_id"]: d["n"] for d in audit.aggregate(
        [{"$group": {"_id": "$agent", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}])}
    by_level = {d["_id"]: d["n"] for d in audit.aggregate(
        [{"$group": {"_id": "$level", "n": {"$sum": 1}}}])}
    return {
        "total_events": audit.count_documents({}),
        "by_agent": by_agent,
        "by_level": by_level,
        "checkpoints": col(settings.COL_CHECKPOINTS).count_documents({}),
        "plans": col(settings.COL_PLANS).count_documents({}),
        "disruptions": col(settings.COL_DISRUPTIONS).count_documents({}),
    }


@router.get("/observability")
def observability() -> dict:
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "langsmith": _langsmith(),
        "audit": _audit(),
    }
