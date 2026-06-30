"""MCP tool: blast_radius_query — $graphLookup over the orders dependency graph.

Given a disrupted supplier id, find all active orders that depend on it, the unique
SKUs affected, and the total required_capacity (SUM of quantity_remaining).
"""
from __future__ import annotations

from app.config import settings
from app.db.mongo import col


def blast_radius_query(affected_supplier_id: str) -> dict:
    pipeline = [
        {"$match": {"status": "active"}},
        # graph traversal: order.depends_on -> supplier._id, capturing the dependency chain
        {"$graphLookup": {
            "from": settings.COL_SUPPLIERS,
            "startWith": "$depends_on",
            "connectFromField": "depends_on",
            "connectToField": "_id",
            "as": "dependency_chain",
        }},
        # keep only orders whose chain includes the disrupted supplier
        {"$match": {"dependency_chain._id": affected_supplier_id}},
        {"$group": {
            "_id": None,
            "impacted_orders": {"$push": {
                "order_number": "$order_number",
                "sku_ids": "$sku_ids",
                "quantity_remaining": "$quantity_remaining",
                "route": "$route",
                "unit_price": "$unit_price",
            }},
            "all_skus": {"$push": "$sku_ids"},
            "required_capacity": {"$sum": "$quantity_remaining"},
        }},
    ]
    res = list(col(settings.COL_ORDERS).aggregate(pipeline))
    if not res:
        return {"affected_skus": [], "impacted_orders": [], "required_capacity": 0}

    doc = res[0]
    flat_skus = sorted({s for group in doc["all_skus"] for s in group})
    return {
        "affected_skus": flat_skus,
        "impacted_orders": doc["impacted_orders"],
        "required_capacity": int(doc["required_capacity"]),
    }
