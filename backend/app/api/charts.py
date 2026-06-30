"""Analytics charts — datasets computed with the MongoDB aggregation framework.

Each dataset ships with the exact pipeline it ran, so the UI can show the MongoDB
query behind every chart. Read-only; isolated from the core workflow.
"""
from __future__ import annotations

import json

from fastapi import APIRouter

from app.config import settings
from app.db.mongo import col

router = APIRouter(tags=["charts"])


def _run(collection: str, pipeline: list[dict]) -> dict:
    data = list(col(collection).aggregate(pipeline))
    return {"data": json.loads(json.dumps(data, default=str)),
            "collection": collection,
            "pipeline": json.loads(json.dumps(pipeline, default=str))}


@router.get("/charts/summary")
def summary() -> dict:
    S, O, P, A, PL = (settings.COL_SUPPLIERS, settings.COL_ORDERS, settings.COL_POLICIES,
                      settings.COL_AUDIT, settings.COL_PLANS)
    return {
        # bar — suppliers per region
        "suppliers_by_region": _run(S, [
            {"$group": {"_id": "$geo_region", "value": {"$sum": 1}}},
            {"$project": {"_id": 0, "name": "$_id", "value": 1}},
            {"$sort": {"value": -1}},
        ]),
        # donut — ESG distribution buckets
        "esg_distribution": _run(S, [
            {"$bucket": {"groupBy": "$esg_score", "boundaries": [0, 60, 80, 101],
                         "default": "n/a", "output": {"value": {"$sum": 1}}}},
            {"$project": {"_id": 0, "bucket": "$_id", "value": 1}},
        ]),
        # horizontal bar — capacity by supplier (top 8)
        "capacity_by_supplier": _run(S, [
            {"$project": {"_id": 0, "name": "$name", "value": "$capacity_units_month"}},
            {"$sort": {"value": -1}}, {"$limit": 8},
        ]),
        # bar — units at risk per disrupted supplier (blast-radius style)
        "units_at_risk_by_supplier": _run(O, [
            {"$match": {"status": "active"}},
            {"$unwind": "$depends_on"},
            {"$group": {"_id": "$depends_on", "value": {"$sum": "$quantity_remaining"}}},
            {"$project": {"_id": 0, "name": "$_id", "value": 1}},
            {"$sort": {"value": -1}}, {"$limit": 8},
        ]),
        # pie — policy chunks by type
        "policies_by_type": _run(P, [
            {"$group": {"_id": "$policy_type", "value": {"$sum": 1}}},
            {"$project": {"_id": 0, "name": "$_id", "value": 1}},
            {"$sort": {"value": -1}},
        ]),
        # bar — audit events by agent
        "audit_by_agent": _run(A, [
            {"$group": {"_id": "$agent", "value": {"$sum": 1}}},
            {"$project": {"_id": 0, "name": "$_id", "value": 1}},
            {"$sort": {"value": -1}},
        ]),
        # donut — mitigation plan actions (AUTO vs HUMAN_REVIEW)
        "plan_actions": _run(PL, [
            {"$group": {"_id": "$recommended_action", "value": {"$sum": 1}}},
            {"$project": {"_id": 0, "name": "$_id", "value": 1}},
        ]),
    }
