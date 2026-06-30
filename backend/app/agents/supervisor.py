"""A. Supervisor Agent — classify the disruption and extract scope (pass 1).

Uses the LLM to parse the free-text alert into structured fields, with a
deterministic regex/keyword fallback so the graph always proceeds.
"""
from __future__ import annotations

import re

from app.agents.state import DisruptionState
from app.config import settings
from app.llm import bedrock
from app.mcp_tools import audit, checkpoints

SYSTEM = (
    "You are the Supervisor Agent for ResilioChain, an autonomous supply-chain "
    "exception-management system. You are the brain of the squad: you read the raw "
    "disruption alert and classify it so the worker agents can act.\n"
    "Extract exactly these fields and nothing else:\n"
    "1. severity — one of LOW | MEDIUM | HIGH | CRITICAL. Judge by impact: natural "
    "disasters / port closures / blockades / war = HIGH or CRITICAL; delays / "
    "congestion / weather = MEDIUM; minor issues = LOW.\n"
    "2. affected_region — the country or port region named in the alert.\n"
    "3. affected_supplier_id — the SUP-xxx identifier if present (else best inference).\n"
    "4. affected_route — object {origin, destination, via_port} for the disrupted lane.\n"
    "Rules: base every field ONLY on the alert text — do not invent suppliers or routes "
    "beyond reasonable inference. Return STRICT JSON with exactly those four keys and no "
    "prose, markdown, or explanation."
)

_SUP_RE = re.compile(r"\bSUP-[A-Z0-9]+\b", re.I)


def _fallback(alert: str) -> dict:
    sup = _SUP_RE.search(alert)
    text = alert.lower()
    if any(w in text for w in ("typhoon", "cyclone", "earthquake", "war", "closed", "blockade")):
        severity = "CRITICAL" if "critical" in text or "war" in text else "HIGH"
    elif any(w in text for w in ("delay", "weather", "congestion")):
        severity = "MEDIUM"
    else:
        severity = "LOW"
    region = ""
    for r in ("Malaysia", "Vietnam", "Indonesia", "South Korea", "Tanjung Pelepas",
              "Singapore", "Shanghai"):
        if r.lower() in text:
            region = r
            break
    return {
        "severity": severity,
        "affected_region": region or "Malaysia",
        "affected_supplier_id": (sup.group(0).upper() if sup else "SUP-001"),
        "affected_route": {"origin": "Shanghai", "destination": "Hamburg",
                           "via_port": "Singapore"},
    }


def supervisor_classify(state: DisruptionState) -> DisruptionState:
    alert = state["alert_text"]
    result = bedrock.complete_json(
        SYSTEM, alert, model=settings.bedrock_model_supervisor,
        agent="supervisor", mock_fn=lambda: _fallback(alert),
    )
    # normalize / guard
    sev = str(result.get("severity", "HIGH")).upper()
    if sev not in ("LOW", "MEDIUM", "HIGH", "CRITICAL"):
        sev = "HIGH"
    state["severity"] = sev
    state["affected_region"] = result.get("affected_region") or "Malaysia"
    state["affected_supplier_id"] = result.get("affected_supplier_id") or "SUP-001"
    state["affected_route"] = result.get("affected_route") or {}

    audit.log(state["thread_id"], "supervisor", "classify",
              input_summary=alert,
              output_summary=f"severity={sev} region={state['affected_region']} "
                             f"supplier={state['affected_supplier_id']}")
    checkpoints.write_checkpoint(state["thread_id"], "supervisor", dict(state))
    return state
