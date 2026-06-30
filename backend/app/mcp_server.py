"""Real MCP server for ResilioChain (FastMCP, streamable-HTTP).

Exposes the MongoDB-backed methods as genuine MCP **tools** and **resources**,
matching the architecture diagram:
  - tool   blast_radius_query      (M1, $graphLookup)
  - tool   supplier_vector_search  (M2, $vectorSearch)
  - tool   compliance_rag_query    (M3, Vector RAG)
  - tool   write_plan / update_plan_status  (M4 plans)
  - resource  checkpoint://{thread_id}      (M4 thread memory)

Each tool delegates to the existing pure-Python implementations in app.mcp_tools,
so the MongoDB logic is identical whether called over MCP or directly.

Run (needs Python >=3.10; use the agentcore venv):
  cd backend && ../.agentcore-venv/bin/python -m app.mcp_server   # http://127.0.0.1:8765/mcp
"""
from __future__ import annotations

import os

from mcp.server.fastmcp import FastMCP

from app.mcp_tools.blast_radius_query import blast_radius_query as _blast
from app.mcp_tools.compliance_rag_query import compliance_rag_query as _rag
from app.mcp_tools.plans import update_plan_status as _update_plan
from app.mcp_tools.plans import write_plan as _write_plan
from app.mcp_tools.checkpoints import read_checkpoint as _read_ckpt
from app.mcp_tools.supplier_vector_search import supplier_vector_search as _vsearch

PORT = int(os.environ.get("MCP_PORT", "8765"))
mcp = FastMCP("resiliochain-mcp", host="127.0.0.1", port=PORT)


@mcp.tool()
def blast_radius_query(affected_supplier_id: str) -> dict:
    """M1 $graphLookup: orders depending on the disrupted supplier + required capacity."""
    return _blast(affected_supplier_id)


@mcp.tool()
def supplier_vector_search(query_text: str, required_capacity: int,
                           exclude_supplier_id: str = "", exclude_region: str = "",
                           top_k: int = 3) -> list:
    """M2 $vectorSearch: capability-matched backups, capacity-filtered."""
    return _vsearch(query_text, required_capacity,
                    exclude_supplier_id or None, exclude_region or None, top_k)


@mcp.tool()
def compliance_rag_query(supplier: dict, top_k: int = 5, policy_type: str = "") -> list:
    """M3 Vector RAG: policy chunks relevant to a supplier."""
    return _rag(supplier, top_k, policy_type or None)


@mcp.tool()
def write_plan(thread_id: str, plan: dict) -> str:
    """M4: persist a mitigation plan; returns plan_id."""
    return _write_plan(thread_id, plan)


@mcp.tool()
def update_plan_status(plan_id: str, status: str) -> bool:
    """M4: update a plan's status."""
    return _update_plan(plan_id, status)


@mcp.resource("checkpoint://{thread_id}")
def checkpoint(thread_id: str) -> dict:
    """M4 thread memory: latest checkpoint state for a workflow thread."""
    return _read_ckpt(thread_id) or {}


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
