"""MCP tool: compliance_rag_query — vector RAG over compliance_policies.

Retrieves the policy chunks most relevant to a given supplier (its geo_region +
capabilities + certifications), which the Compliance Agent then analyzes.
"""
from __future__ import annotations

from app.config import settings
from app.mcp_tools._vs import run_vector_pipeline


def compliance_rag_query(supplier: dict, top_k: int = 5,
                         policy_type: str | None = None) -> list[dict]:
    region = supplier.get("geo_region", "")
    caps = ", ".join(supplier.get("capabilities", []))
    query_text = (f"{region} supplier ESG labour sanctions carbon compliance for "
                  f"automotive electronics {caps}")

    vfilter = {"policy_type": policy_type} if policy_type else None

    if settings.embedding_mode == "explicit":
        from app.mcp_tools._embed import embed_query
        vs = {
            "index": settings.IDX_POLICY_VECTOR,
            "path": "embedding",
            "queryVector": embed_query(query_text),
            "numCandidates": 100,
            "limit": top_k,
        }
    else:
        vs = {
            "index": settings.IDX_POLICY_VECTOR,
            "path": "text",
            "query": {"text": query_text},
            "numCandidates": 100,
            "limit": top_k,
        }
    if vfilter:
        vs["filter"] = vfilter

    pipeline = [
        {"$vectorSearch": vs},
        {"$project": {
            "_id": 0, "source_doc": 1, "policy_type": 1, "text": 1,
            "score": {"$meta": "vectorSearchScore"},
        }},
    ]
    return run_vector_pipeline(settings.COL_POLICIES, pipeline)
