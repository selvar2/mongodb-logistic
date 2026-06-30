"""C. Sourcing Agent — semantic supplier match via $vectorSearch.

Capacity is a hard filter enforced in the query. The disrupted supplier and any
previously-rejected suppliers are excluded. Returns a ranked candidate pool.
"""
from __future__ import annotations

from app.agents.state import DisruptionState
from app.mcp_tools import audit, checkpoints
from app.mcp_client import supplier_vector_search  # MCP tool (falls back to Python)

# Vector scores barely differentiate short supplier texts, so we pull a wide
# capacity/region-filtered pool for RECALL and let the Planner rank on business merit.
POOL_SIZE = 12


def sourcing(state: DisruptionState) -> DisruptionState:
    skus = ", ".join(state.get("affected_skus", []))
    query_text = (f"automotive-grade 32-bit microcontroller (AEC-Q100) and sensor "
                  f"components backup supplier for SKUs {skus}")
    state["sourcing_query"] = query_text

    rejected = set(state.get("rejected_supplier_ids", []))
    candidates = supplier_vector_search(
        query_text=query_text,
        required_capacity=state["required_capacity"],
        exclude_supplier_id=state["affected_supplier_id"],
        exclude_region=state.get("affected_region"),
        top_k=POOL_SIZE,
    )
    # also drop already-rejected suppliers (vector filter only excludes one id)
    candidates = [c for c in candidates if c["supplier_id"] not in rejected]
    state["candidate_suppliers"] = candidates

    audit.log(state["thread_id"], "sourcing", "vector_search",
              input_summary=f"required_capacity={state['required_capacity']}",
              output_summary="candidates=" + ", ".join(
                  f"{c['supplier_id']}({c['similarity_score']})" for c in candidates))
    checkpoints.write_checkpoint(state["thread_id"], "sourcing", dict(state))
    return state
