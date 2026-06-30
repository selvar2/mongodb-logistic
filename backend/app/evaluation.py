"""MongoDB-native AI evaluation layer (isolated from the core workflow).

Defines an eval dataset of disruption scenarios with expected outcomes, runs the
agent graph over them in DETERMINISTIC mock mode, scores each with a panel of
deterministic evaluators, and persists the run + aggregate metrics in MongoDB
(`eval_dataset`, `eval_runs`). Metrics are computed with the aggregation framework.

Nothing here touches the core workflow — it only *calls* run_workflow as the system
under test.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone

from app.config import settings
from app.db.mongo import col

COL_DATASET = "eval_dataset"
COL_RUNS = "eval_runs"

# ---------------------------------------------------------------------------
# Eval dataset — scenarios + expected outcomes (property-based, not brittle IDs)
# ---------------------------------------------------------------------------
EVAL_CASES = [
    {
        "id": "yagi-sup001",
        "name": "Typhoon Yagi — SUP-001 port closure",
        "alert_text": ("Typhoon Yagi has closed the Port of Tanjung Pelepas (Malaysia) for 72 "
                       "hours. Primary supplier SUP-001 has stock but cannot deliver 23 active "
                       "orders totalling 48,200 units of automotive-grade MCUs and sensors."),
        "expects": {"status": "complete", "winner_compliant": True,
                    "winner_not_region": "Malaysia", "rejected_contains": "SUP-FAIL",
                    "action_in": ["AUTO_EXECUTE", "HUMAN_REVIEW"], "confidence_min": 50,
                    "confidence_max": 100},
        "mongodb_features": ["$graphLookup", "$vectorSearch", "Vector RAG"],
    },
    {
        "id": "unknown-supplier",
        "name": "Unknown supplier — no blast radius",
        "alert_text": "Flood affecting supplier SUP-ZZZ in an unknown region; status uncertain.",
        "expects": {"status": "halted_no_impact"},
        "mongodb_features": ["$graphLookup"],
    },
    {
        "id": "secondary-supplier",
        "name": "Secondary supplier disruption — SUP-003",
        "alert_text": ("Earthquake disrupts supplier SUP-003 in South Korea; several active "
                       "orders for automotive components cannot be fulfilled."),
        "expects": {"winner_compliant": True, "no_invented_supplier": True,
                    "action_in": ["AUTO_EXECUTE", "HUMAN_REVIEW"]},
        "mongodb_features": ["$graphLookup", "$vectorSearch", "Vector RAG"],
    },
    {
        "id": "war-critical",
        "name": "War / sanctions — CRITICAL severity on SUP-001",
        "alert_text": ("War and new sanctions have cut off supplier SUP-001 in Malaysia; this is "
                       "a critical disruption to 48,200 units of MCUs."),
        "expects": {"status": "complete", "winner_compliant": True,
                    "rejected_contains": "SUP-FAIL", "no_invented_supplier": True},
        "mongodb_features": ["$graphLookup", "$vectorSearch", "Vector RAG"],
    },
    {
        "id": "esg-guardrail",
        "name": "ESG guardrail — non-compliant never wins",
        "alert_text": ("Cyclone disrupts SUP-001 in Malaysia; 23 orders of automotive-grade MCUs "
                       "are blocked and must be re-sourced from a compliant supplier."),
        "expects": {"winner_compliant": True, "rejected_are_noncompliant": True,
                    "action_in": ["AUTO_EXECUTE", "HUMAN_REVIEW"]},
        "mongodb_features": ["$vectorSearch", "Vector RAG"],
    },
]


# ---------------------------------------------------------------------------
# Deterministic evaluators over the final DisruptionState
# ---------------------------------------------------------------------------
def _supplier_esg(supplier_id: str) -> int | None:
    d = col(settings.COL_SUPPLIERS).find_one({"_id": supplier_id}, {"esg_score": 1})
    return d.get("esg_score") if d else None


def _evaluate(case: dict, state: dict) -> dict:
    exp = case["expects"]
    brief = state.get("mitigation_brief", {}) or {}
    winner = brief.get("backup_supplier")
    rejected = {r["supplier_id"] for r in state.get("compliance_results", []) if not r.get("passed")}
    vetted = state.get("vetted_suppliers", [])
    checks: dict[str, bool] = {}

    if "status" in exp:
        checks["status_match"] = state.get("status") == exp["status"]
    if exp.get("winner_compliant"):
        esg = _supplier_esg(winner) if winner else None
        # halted runs have no winner — treat as N/A pass if status expected halted
        checks["winner_compliant"] = (esg is not None and esg >= 60) if winner else \
            (state.get("status") == "halted_no_impact")
    if "winner_not_region" in exp and winner:
        d = col(settings.COL_SUPPLIERS).find_one({"_id": winner}, {"geo_region": 1})
        checks["winner_not_region"] = (d or {}).get("geo_region") != exp["winner_not_region"]
    if "rejected_contains" in exp:
        # pass if the named supplier was rejected OR never surfaced as a candidate
        cand_ids = {c["supplier_id"] for c in state.get("candidate_suppliers", [])}
        checks["rejected_contains"] = (exp["rejected_contains"] in rejected
                                       or exp["rejected_contains"] not in cand_ids)
    if exp.get("rejected_are_noncompliant"):
        # precision: nobody rejected should actually be compliant (esg>=60 & not region-risk)
        bad = [s for s in rejected if (_supplier_esg(s) or 0) >= 60
               and (col(settings.COL_SUPPLIERS).find_one({"_id": s}, {"geo_region": 1}) or {})
               .get("geo_region") not in ("Vietnam",)]
        checks["rejected_are_noncompliant"] = len(bad) == 0
    if exp.get("no_invented_supplier"):
        checks["no_invented_supplier"] = (winner is None or
                                          col(settings.COL_SUPPLIERS).count_documents({"_id": winner}) == 1)
    if "action_in" in exp and state.get("status") == "complete":
        checks["action_valid"] = state.get("recommended_action") in exp["action_in"]
    if "confidence_min" in exp and state.get("status") == "complete":
        c = state.get("confidence_score", 0)
        checks["confidence_in_band"] = exp["confidence_min"] <= c <= exp.get("confidence_max", 100)

    passed = all(checks.values()) if checks else True
    return {
        "case_id": case["id"], "name": case["name"], "passed": passed,
        "checks": checks, "status": state.get("status"),
        "winner": winner, "confidence": state.get("confidence_score"),
        "recommended_action": state.get("recommended_action"),
        "rejected": sorted(rejected), "vetted_count": len(vetted),
        "mongodb_features": case["mongodb_features"],
    }


# ---------------------------------------------------------------------------
# Run + persist
# ---------------------------------------------------------------------------
def run_eval() -> dict:
    # force deterministic mock mode for the system under test (no Bedrock cost/flakiness)
    prev = os.environ.get("LLM_MODE")
    os.environ["LLM_MODE"] = "mock"
    settings.llm_mode = "mock"
    try:
        from app.agents.graph import run_workflow
        results = []
        for case in EVAL_CASES:
            state = run_workflow(case["alert_text"], thread_id=f"eval-{case['id']}-{uuid.uuid4().hex[:6]}")
            results.append(_evaluate(case, state))
    finally:
        if prev is not None:
            os.environ["LLM_MODE"] = prev
            settings.llm_mode = prev.lower()

    passed = sum(1 for r in results if r["passed"])
    # per-evaluator rollup
    by_evaluator: dict[str, dict] = {}
    for r in results:
        for k, v in r["checks"].items():
            d = by_evaluator.setdefault(k, {"pass": 0, "total": 0})
            d["total"] += 1
            d["pass"] += 1 if v else 0
    confs = [r["confidence"] for r in results if r["confidence"]]
    metrics = {
        "total": len(results), "passed": passed,
        "pass_rate": round(100 * passed / len(results)) if results else 0,
        "avg_confidence": round(sum(confs) / len(confs)) if confs else None,
        "by_evaluator": by_evaluator,
    }
    run_doc = {"run_id": uuid.uuid4().hex[:10], "ts": datetime.now(timezone.utc),
               "metrics": metrics, "cases": results}
    col(COL_RUNS).insert_one(dict(run_doc))
    # upsert the dataset (so it lives in MongoDB too)
    for c in EVAL_CASES:
        col(COL_DATASET).update_one({"_id": c["id"]}, {"$set": c}, upsert=True)
    run_doc.pop("_id", None)
    return run_doc


def latest() -> dict | None:
    return col(COL_RUNS).find_one({}, sort=[("ts", -1)])


def history(limit: int = 20) -> list[dict]:
    return list(col(COL_RUNS).find({}, {"_id": 0, "run_id": 1, "ts": 1, "metrics.pass_rate": 1,
                                        "metrics.passed": 1, "metrics.total": 1})
                .sort("ts", -1).limit(limit))


def dataset() -> list[dict]:
    return EVAL_CASES
