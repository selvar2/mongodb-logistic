"""Health + readiness endpoint."""
from __future__ import annotations

from fastapi import APIRouter

from app.db.mongo import ping
from app.llm import bedrock

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    try:
        mongo_ok = ping()
    except Exception as exc:  # surface but don't crash
        mongo_ok = False
        mongo_err = str(exc)[:200]
    else:
        mongo_err = None
    return {
        "status": "ok" if mongo_ok else "degraded",
        "mongo": {"connected": mongo_ok, "error": mongo_err},
        "llm": bedrock.health(),
        "service": "resiliochain-api",
    }
