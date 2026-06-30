"""Read-only data endpoints for the audit log + MongoDB Data Explorer."""
from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter

from app.config import settings
from app.db.mongo import col

router = APIRouter(tags=["data"])


def _safe(items):
    return json.loads(json.dumps(items, default=str))


@router.get("/audit-logs")
def audit_logs(thread_id: Optional[str] = None, limit: int = 200) -> dict:
    q = {"thread_id": thread_id} if thread_id else {}
    items = list(col(settings.COL_AUDIT).find(q, {"_id": 0}).sort("ts", -1).limit(limit))
    return {"count": len(items), "items": _safe(items)}


@router.get("/suppliers")
def suppliers() -> dict:
    items = list(col(settings.COL_SUPPLIERS).find({}, {"embedding": 0}))
    return {"count": len(items), "items": _safe(items)}


@router.get("/orders")
def orders(supplier_id: Optional[str] = None, limit: int = 100) -> dict:
    q = {"depends_on": supplier_id} if supplier_id else {}
    items = list(col(settings.COL_ORDERS).find(q).limit(limit))
    return {"count": len(items), "items": _safe(items)}


@router.get("/policies")
def policies(policy_type: Optional[str] = None, limit: int = 100) -> dict:
    q = {"policy_type": policy_type} if policy_type else {}
    items = list(col(settings.COL_POLICIES).find(q, {"embedding": 0}).limit(limit))
    return {"count": len(items), "items": _safe(items)}


@router.get("/pipelines")
def pipelines() -> dict:
    """Expose the real MongoDB AI pipelines the agents use (for the Data Explorer)."""
    return {
        "blast_radius_$graphLookup": {
            "collection": settings.COL_ORDERS,
            "stages": ["$match status=active", "$graphLookup orders→suppliers via depends_on",
                       "$match dependency_chain._id = affected_supplier",
                       "$group sum(quantity_remaining) = required_capacity"],
        },
        "supplier_$vectorSearch": {
            "collection": settings.COL_SUPPLIERS,
            "index": settings.IDX_SUPPLIER_VECTOR,
            "stages": ["$vectorSearch autoEmbed(Voyage) on embed_text + capacity filter",
                       "$match exclude disrupted supplier & region", "$project similarity_score"],
        },
        "compliance_$vectorSearch_RAG": {
            "collection": settings.COL_POLICIES,
            "index": settings.IDX_POLICY_VECTOR,
            "stages": ["$vectorSearch autoEmbed(Voyage) on text (policy chunks)",
                       "$project source_doc, policy_type, text, score"],
        },
    }
