"""B. Impact Assessor Agent — compute the blast radius via $graphLookup.

Purely tool-driven: it uses ONLY what blast_radius_query returns (no invented orders).
"""
from __future__ import annotations

from app.agents.state import DisruptionState
from app.mcp_tools import audit, checkpoints
from app.mcp_client import blast_radius_query  # MCP tool (falls back to Python)


def impact_assessor(state: DisruptionState) -> DisruptionState:
    supplier_id = state["affected_supplier_id"]
    result = blast_radius_query(supplier_id)

    state["affected_skus"] = result["affected_skus"]
    state["impacted_orders"] = result["impacted_orders"]
    state["required_capacity"] = result["required_capacity"]

    if not result["impacted_orders"]:
        state["status"] = "halted_no_impact"
        audit.log(state["thread_id"], "impact_assessor", "blast_radius",
                  input_summary=supplier_id,
                  output_summary="no impacted orders — halting", level="warn")
    else:
        audit.log(state["thread_id"], "impact_assessor", "blast_radius",
                  input_summary=f"supplier={supplier_id}",
                  output_summary=f"{len(result['impacted_orders'])} orders, "
                                 f"{len(result['affected_skus'])} SKUs, "
                                 f"required_capacity={result['required_capacity']}")
    checkpoints.write_checkpoint(state["thread_id"], "impact_assessor", dict(state))
    return state
