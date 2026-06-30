"""E. Mitigation Planner (Supervisor pass 2) — compile the ranked brief.

Selects the best vetted supplier, computes cost variance, assigns a DETERMINISTIC
confidence score, decides AUTO_EXECUTE vs HUMAN_REVIEW, and writes the plan (M4).
"""
from __future__ import annotations

import json

from app.agents.confidence import compute_confidence, decide_action
from app.agents.state import DisruptionState
from app.config import settings
from app.db.mongo import col
from app.llm import bedrock
from app.mcp_tools import audit, checkpoints
from app.mcp_client import write_plan as mcp_write_plan  # MCP tool (falls back to Python)

ORIGINAL_UNIT_PRICE = 2.50

# The Planner uses a Sonnet model (complex multi-step reasoning) to phrase the
# executive summary ONLY. Every number — confidence, cost variance, recommended
# action, ranking — is computed deterministically (golden rule: the confidence
# score is tool-computed, never LLM-generated). The LLM may not change any figure.
PLANNER_SYSTEM = (
    "You are the Mitigation Planner for ResilioChain, an autonomous supply-chain "
    "exception-management system. You are given a FACTS object containing the already-"
    "computed mitigation decision: the disrupted supplier, impacted order/unit counts, "
    "the winning backup supplier and its metrics (region, ESG, capacity, lead time, "
    "cost variance), the deterministic confidence score, the recommended action "
    "(AUTO_EXECUTE or HUMAN_REVIEW), and any rejected suppliers with reasons.\n"
    "Write a crisp, decision-ready executive summary (2–3 sentences) a supply-chain "
    "manager can act on: name the disrupted supplier and impact, the recommended "
    "backup and why it wins (compliance, capacity, cost, ESG), and the action.\n"
    "STRICT RULES: use ONLY the numbers in FACTS — never invent or alter figures, the "
    "confidence score, or the recommended action. Return STRICT JSON: "
    '{"summary": "<text>"} with no markdown or extra keys.'
)


def _narrative_summary(facts: dict, fallback: str) -> str:
    """Sonnet-phrased executive summary, with a deterministic fallback so the
    workflow always completes (mock mode or any Bedrock error → fallback)."""
    try:
        res = bedrock.complete_json(
            PLANNER_SYSTEM, json.dumps(facts), model=settings.bedrock_model_planner,
            agent="mitigation_planner", mock_fn=lambda: {"summary": fallback},
            max_tokens=300,
        )
        summary = (res.get("summary") or "").strip()
        return summary or fallback
    except Exception:  # never let the narrative break plan compilation
        return fallback


def mitigation_planner(state: DisruptionState) -> DisruptionState:
    vetted = state.get("vetted_suppliers", [])
    if not vetted:
        state["status"] = "escalated_hitl"
        state["recommended_action"] = "HUMAN_REVIEW"
        state["confidence_score"] = 0
        state["mitigation_brief"] = {
            "summary": "No compliant alternative supplier found within retry budget. "
                       "Escalated to human review.",
            "options": [],
        }
        audit.log(state["thread_id"], "mitigation_planner", "escalate",
                  output_summary="no vetted suppliers -> HITL", level="warn")
        checkpoints.write_checkpoint(state["thread_id"], "mitigation_planner", dict(state))
        return state

    # original supplier price (for cost variance)
    orig = col(settings.COL_SUPPLIERS).find_one({"_id": state["affected_supplier_id"]})
    orig_price = (orig or {}).get("unit_price", ORIGINAL_UNIT_PRICE)
    req_cap = state["required_capacity"]

    options = []
    for v in vetted:
        unit_price = v.get("unit_price", orig_price)
        cost_variance_usd = round((unit_price - orig_price) * req_cap, 2)
        cost_variance_pct = round(((unit_price - orig_price) / orig_price) * 100, 2) \
            if orig_price else 0.0
        confidence = compute_confidence(
            esg_score=v.get("esg_score", 0),
            cost_variance_pct=cost_variance_pct,
            capacity_units_month=v.get("capacity_units_month", 0),
            required_capacity=req_cap,
            lead_time_days=v.get("lead_time_days", 0),
            compliance_passed=True,  # only PASS suppliers are in vetted
        )
        options.append({
            "supplier_id": v["supplier_id"],
            "name": v.get("name", ""),
            "geo_region": v.get("geo_region", ""),
            "esg_score": v.get("esg_score", 0),
            "lead_time_days": v.get("lead_time_days", 0),
            "capacity_units_month": v.get("capacity_units_month", 0),
            "unit_price": unit_price,
            "cost_variance_usd": cost_variance_usd,
            "cost_variance_pct": cost_variance_pct,
            "confidence_score": confidence,
            "certifications": v.get("certifications", []),
        })

    # rank: highest confidence, then lowest cost variance, then highest ESG
    options.sort(key=lambda o: (-o["confidence_score"], o["cost_variance_pct"],
                                -o["esg_score"]))
    winner = options[0]
    confidence = winner["confidence_score"]
    action = decide_action(confidence, winner["esg_score"])

    plan_id = f"PLAN-{state['thread_id'][:8]}"
    orders_count = len(state.get("impacted_orders", []))
    rejected = [{"supplier_id": r["supplier_id"], "reasons": r["fail_reasons"]}
                for r in state.get("compliance_results", []) if not r["passed"]]

    # Deterministic fallback summary (always valid); Sonnet enriches the phrasing.
    det_summary = (f"Disrupted supplier {state['affected_supplier_id']} cannot fulfil "
                   f"{orders_count} orders ({req_cap} units). Recommend {winner['name']} "
                   f"({winner['supplier_id']}, {winner['geo_region']}): compliant, "
                   f"capacity {winner['capacity_units_month']}, "
                   f"+{winner['cost_variance_pct']}% cost, ESG {winner['esg_score']}.")
    summary = _narrative_summary({
        "disrupted_supplier": state["affected_supplier_id"],
        "affected_orders_count": orders_count,
        "required_capacity": req_cap,
        "recommended_backup": {k: winner[k] for k in
                               ("supplier_id", "name", "geo_region", "esg_score",
                                "capacity_units_month", "lead_time_days",
                                "cost_variance_usd", "cost_variance_pct")},
        "confidence_score": confidence,
        "recommended_action": action,
        "rejected_suppliers": rejected,
    }, det_summary)

    brief = {
        "plan_id": plan_id,
        "affected_orders_count": orders_count,
        "required_capacity": req_cap,
        "disrupted_supplier": state["affected_supplier_id"],
        "backup_supplier": winner["supplier_id"],
        "backup_supplier_name": winner["name"],
        "reroute_via": state.get("affected_route", {}).get("via_port", ""),
        "lead_time_delta_days": winner["lead_time_days"],
        "cost_variance_usd": winner["cost_variance_usd"],
        "cost_variance_pct": winner["cost_variance_pct"],
        "esg_status": "PASS" if winner["esg_score"] >= 60 else "FAIL",
        "confidence_score": confidence,
        "recommended_action": action,
        "summary": summary,
        "options": options,
        "rejected": rejected,
    }

    state["mitigation_brief"] = brief
    state["confidence_score"] = confidence
    state["recommended_action"] = action
    state["status"] = "complete"

    mcp_write_plan(state["thread_id"], {
        "plan_id": plan_id,
        "backup_supplier": winner["supplier_id"],
        "confidence_score": confidence,
        "recommended_action": action,
        "cost_variance_usd": winner["cost_variance_usd"],
        "cost_variance_pct": winner["cost_variance_pct"],
        "affected_orders_count": brief["affected_orders_count"],
        "reroute_via": brief["reroute_via"],
        "lead_time_delta_days": brief["lead_time_delta_days"],
        "esg_status": brief["esg_status"],
        "options": options,
        "status": "PROPOSED" if action == "HUMAN_REVIEW" else "AUTO_APPROVED",
    })

    audit.log(state["thread_id"], "mitigation_planner", "compile_plan",
              output_summary=f"winner={winner['supplier_id']} confidence={confidence} "
                             f"action={action}")
    checkpoints.write_checkpoint(state["thread_id"], "mitigation_planner", dict(state))
    return state
