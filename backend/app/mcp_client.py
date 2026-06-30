"""MCP client wrapper with automatic fallback to local Python methods.

Each function tries the real MCP server (streamable-HTTP, JSON-RPC) first; on ANY
failure — server down, timeout, protocol error — it transparently falls back to the
in-process Python implementation in app.mcp_tools. The workflow therefore always
works, whether or not the MCP server is running.

Config (env):
  MCP_ENABLED   = "true" | "false"  (default true — attempt MCP, fall back on failure)
  MCP_ENABLED   = "true" | "false"  (default FALSE — use the reliable in-process
                  Python tools directly. Set true only when the MCP server is
                  actually running, e.g. for the MCP-transport demo. This avoids
                  attempting a dead 127.0.0.1:8765 on every fresh process.)
  MCP_URL       = base MCP endpoint (default http://127.0.0.1:8765/mcp)

This module exposes the same function names the agents already use, so wiring is a
one-line import swap per agent.
"""
from __future__ import annotations

import json
import os
import threading

import requests

# local implementations (the fallback + the source of truth for the MCP server)
from app.mcp_tools.blast_radius_query import blast_radius_query as _blast
from app.mcp_tools.compliance_rag_query import compliance_rag_query as _rag
from app.mcp_tools.plans import update_plan_status as _update_plan
from app.mcp_tools.plans import write_plan as _write_plan
from app.mcp_tools.supplier_vector_search import supplier_vector_search as _vsearch

MCP_ENABLED = os.environ.get("MCP_ENABLED", "false").lower() == "true"
MCP_URL = os.environ.get("MCP_URL", "http://127.0.0.1:8765/mcp")
_TIMEOUT = float(os.environ.get("MCP_TIMEOUT", "8"))

_lock = threading.Lock()
_session_id: str | None = None
_mcp_down = False          # set True after a failed attempt -> fail fast to fallback
_last_transport = "?"      # "mcp" or "fallback" — for observability/logging


def last_transport() -> str:
    return _last_transport


def _parse_sse_or_json(resp: requests.Response) -> dict:
    ctype = resp.headers.get("content-type", "")
    if "text/event-stream" in ctype:
        for line in resp.text.splitlines():
            line = line.strip()
            if line.startswith("data:"):
                return json.loads(line[5:].strip())
        raise RuntimeError("no data frame in SSE response")
    return resp.json()


def _rpc(method: str, params: dict | None, *, notify: bool = False):
    """Single JSON-RPC call over streamable-HTTP. Returns the 'result' dict."""
    global _session_id
    headers = {"Content-Type": "application/json",
               "Accept": "application/json, text/event-stream"}
    if _session_id:
        headers["mcp-session-id"] = _session_id
    body = {"jsonrpc": "2.0", "method": method}
    if not notify:
        body["id"] = 1
    if params is not None:
        body["params"] = params
    resp = requests.post(MCP_URL, headers=headers, json=body, timeout=_TIMEOUT)
    if "mcp-session-id" in resp.headers:
        _session_id = resp.headers["mcp-session-id"]
    if notify:
        return None
    resp.raise_for_status()
    data = _parse_sse_or_json(resp)
    if "error" in data:
        raise RuntimeError(f"MCP error: {data['error']}")
    return data.get("result", {})


def _ensure_session():
    global _session_id
    if _session_id:
        return
    _rpc("initialize", {
        "protocolVersion": "2025-03-26",
        "capabilities": {},
        "clientInfo": {"name": "resiliochain-agent", "version": "1.0"},
    })
    _rpc("notifications/initialized", None, notify=True)


def _parse(text: str):
    """JSON-decode a content text item; fall back to the raw string for plain scalars."""
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return text


def _call_tool(name: str, arguments: dict) -> list:
    """Call an MCP tool; return the parsed content items as a list.

    FastMCP emits one content item per element for list returns, and a single
    content item for scalar/dict returns — so we always normalize to a list here.
    """
    with _lock:
        _ensure_session()
        result = _rpc("tools/call", {"name": name, "arguments": arguments})
    if result.get("isError"):
        raise RuntimeError(f"tool {name} returned error: {result}")
    items = [_parse(c["text"]) for c in result.get("content", []) if c.get("type") == "text"]
    return items


def _via_mcp(name: str, arguments: dict, fallback, *, scalar: bool = False):
    """Try MCP; on ANY failure, fall back to the local Python function.

    scalar=True  -> tool returns a single value (dict/str/bool) -> first item
    scalar=False -> tool returns a list -> all items
    """
    global _mcp_down, _last_transport
    if MCP_ENABLED and not _mcp_down:
        try:
            items = _call_tool(name, arguments)
            _last_transport = "mcp"
            if scalar:
                return items[0] if items else None
            return items
        except Exception as exc:  # noqa: BLE001 — any failure -> fallback
            _mcp_down = True
            print(f"  [mcp-fallback] {name}: {type(exc).__name__}: {str(exc)[:80]} "
                  f"-> using local Python method")
    _last_transport = "fallback"
    return fallback()


# ---- public API (same names the agents already import) ----------------------
def blast_radius_query(affected_supplier_id: str) -> dict:
    return _via_mcp("blast_radius_query",
                    {"affected_supplier_id": affected_supplier_id},
                    lambda: _blast(affected_supplier_id), scalar=True)


def supplier_vector_search(query_text: str, required_capacity: int,
                           exclude_supplier_id: str | None = None,
                           exclude_region: str | None = None,
                           top_k: int = 3) -> list:
    return _via_mcp("supplier_vector_search",
                    {"query_text": query_text, "required_capacity": int(required_capacity),
                     "exclude_supplier_id": exclude_supplier_id or "",
                     "exclude_region": exclude_region or "", "top_k": top_k},
                    lambda: _vsearch(query_text, required_capacity,
                                     exclude_supplier_id, exclude_region, top_k))


def compliance_rag_query(supplier: dict, top_k: int = 5,
                         policy_type: str | None = None) -> list:
    return _via_mcp("compliance_rag_query",
                    {"supplier": supplier, "top_k": top_k, "policy_type": policy_type or ""},
                    lambda: _rag(supplier, top_k, policy_type))


def write_plan(thread_id: str, plan: dict) -> str:
    return _via_mcp("write_plan", {"thread_id": thread_id, "plan": plan},
                    lambda: _write_plan(thread_id, plan), scalar=True)


def update_plan_status(plan_id: str, status: str) -> bool:
    return _via_mcp("update_plan_status", {"plan_id": plan_id, "status": status},
                    lambda: _update_plan(plan_id, status), scalar=True)
