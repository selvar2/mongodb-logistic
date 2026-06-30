"""MCP tool: supplier_vector_search — $vectorSearch with a hard capacity filter.

Capacity filter is enforced at the query level (not by the LLM). The disrupted
supplier is excluded. Supports autoEmbed (query.text) and explicit (queryVector) modes.
"""
from __future__ import annotations

from app.config import settings
from app.mcp_tools._vs import run_vector_pipeline

VOYAGE_MODEL = "voyage-4"


def supplier_vector_search(query_text: str, required_capacity: int,
                           exclude_supplier_id: str | None = None,
                           exclude_region: str | None = None,
                           top_k: int = 3) -> list[dict]:
    vfilter: dict = {"capacity_units_month": {"$gte": int(required_capacity)}}

    if settings.embedding_mode == "explicit":
        from app.mcp_tools._embed import embed_query
        stage = {
            "$vectorSearch": {
                "index": settings.IDX_SUPPLIER_VECTOR,
                "path": "embedding",
                "queryVector": embed_query(query_text),
                "filter": vfilter,
                "numCandidates": 100,
                "limit": top_k,
            }
        }
    else:
        stage = {
            "$vectorSearch": {
                "index": settings.IDX_SUPPLIER_VECTOR,
                "path": "embed_text",
                "query": {"text": query_text},
                "filter": vfilter,
                "numCandidates": 100,
                "limit": top_k,
            }
        }

    pipeline: list[dict] = [stage]
    post: dict = {}
    if exclude_supplier_id:
        # _id cannot be a vector filter field, so exclude after retrieval
        post["_id"] = {"$ne": exclude_supplier_id}
    if exclude_region:
        # never recommend a supplier in the disrupted region
        post["geo_region"] = {"$ne": exclude_region}
    if post:
        pipeline.append({"$match": post})
    pipeline += [
        {"$project": {
            "_id": 1, "name": 1, "capabilities": 1, "capacity_units_month": 1,
            "geo_region": 1, "lead_time_days": 1, "esg_score": 1,
            "certifications": 1, "unit_price": 1,
            "similarity_score": {"$meta": "vectorSearchScore"},
        }},
    ]
    out = []
    for d in run_vector_pipeline(settings.COL_SUPPLIERS, pipeline):
        d["supplier_id"] = d.pop("_id")
        d["similarity_score"] = round(float(d.get("similarity_score", 0.0)), 4)
        out.append(d)
    return out
