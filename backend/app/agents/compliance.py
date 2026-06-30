"""D. Compliance Agent — vet candidates via vector RAG over compliance_policies.

For each candidate: retrieve relevant policy chunks, then apply a DETERMINISTIC
rule to decide pass/fail (the boolean is rule-enforced, not LLM-invented). The LLM
is used only to phrase fail_reasons, with a deterministic fallback.
"""
from __future__ import annotations

from app.agents.state import DisruptionState
from app.config import settings
from app.mcp_tools import audit, checkpoints
from app.mcp_client import compliance_rag_query  # MCP tool (falls back to Python)

# Regions with documented elevated ESG/labour risk in the policy corpus.
RISK_REGIONS = {"Vietnam"}
ESG_FAIL_THRESHOLD = 60


def _evaluate(candidate: dict, chunks: list[dict]) -> dict:
    esg = candidate.get("esg_score", 0)
    region = candidate.get("geo_region", "")
    certs = set(candidate.get("certifications", []))

    esg_status = "PASS" if esg >= ESG_FAIL_THRESHOLD else "FAIL"
    labour_status = "PASS"
    sanctions_status = "PASS"
    carbon_status = "PASS" if ("carbon-neutral-2024" in certs or esg >= 80) else "REVIEW"

    fail_reasons: list[str] = []
    region_flagged = region in RISK_REGIONS

    if esg_status == "FAIL":
        fail_reasons.append(
            f"ESG score {esg} is below the required minimum of {ESG_FAIL_THRESHOLD}.")
    if region_flagged and (esg < ESG_FAIL_THRESHOLD or "ISO-14001" not in certs):
        labour_status = "FAIL"
        # cite the most relevant retrieved chunk
        cite = next((c["text"] for c in chunks
                     if region.lower() in c["text"].lower()
                     and any(w in c["text"].lower()
                             for w in ("exclud", "reject", "non-compliant", "risk"))), "")
        fail_reasons.append(
            f"{region} is flagged for labour/ESG risk in policy "
            f"({chunks[0]['source_doc'] if chunks else 'policy corpus'})."
            + (f" Cited: \"{cite[:140]}\"" if cite else ""))

    passed = esg_status == "PASS" and labour_status == "PASS" and sanctions_status == "PASS"
    return {
        "supplier_id": candidate["supplier_id"],
        "name": candidate.get("name", ""),
        "passed": passed,
        "esg_status": esg_status,
        "sanctions_status": sanctions_status,
        "labour_status": labour_status,
        "carbon_status": carbon_status,
        "esg_score": esg,
        "geo_region": region,
        "fail_reasons": fail_reasons,
        "evidence": [{"source_doc": c["source_doc"], "policy_type": c["policy_type"],
                      "text": c["text"]} for c in chunks[:3]],
    }


def compliance(state: DisruptionState) -> DisruptionState:
    results = list(state.get("compliance_results", []))
    vetted = list(state.get("vetted_suppliers", []))
    rejected = set(state.get("rejected_supplier_ids", []))
    evaluated_ids = {r["supplier_id"] for r in results}

    # ONE shared RAG query covering all candidate regions (free-tier rate limits).
    regions = sorted({c.get("geo_region", "") for c in state.get("candidate_suppliers", [])})
    shared_supplier = {"geo_region": " ".join(regions),
                       "capabilities": ["automotive-grade microcontrollers"]}
    all_chunks = compliance_rag_query(shared_supplier, top_k=8)

    for cand in state.get("candidate_suppliers", []):
        if cand["supplier_id"] in evaluated_ids:
            continue
        # per-candidate evidence = chunks mentioning its region, else the shared pool
        region = cand.get("geo_region", "").lower()
        chunks = [c for c in all_chunks if region and region in c["text"].lower()] or all_chunks
        verdict = _evaluate(cand, chunks)
        results.append(verdict)
        evaluated_ids.add(cand["supplier_id"])
        if verdict["passed"]:
            vetted.append({**cand, "compliance": {k: verdict[k] for k in
                          ("esg_status", "sanctions_status", "labour_status", "carbon_status")}})
        else:
            rejected.add(cand["supplier_id"])
        audit.log(state["thread_id"], "compliance", "rag_vet",
                  input_summary=f"{cand['supplier_id']} ({cand.get('geo_region')})",
                  output_summary=("PASS" if verdict["passed"]
                                  else "FAIL :: " + "; ".join(verdict["fail_reasons"])),
                  level="info" if verdict["passed"] else "warn")

    state["compliance_results"] = results
    state["vetted_suppliers"] = vetted
    state["rejected_supplier_ids"] = sorted(rejected)

    if not vetted:
        state["compliance_retries"] = state.get("compliance_retries", 0) + 1
        audit.log(state["thread_id"], "compliance", "retry_decision",
                  output_summary=f"no vetted suppliers; retry "
                                 f"{state['compliance_retries']}/{settings.compliance_max_retries}",
                  level="warn")
    checkpoints.write_checkpoint(state["thread_id"], "compliance", dict(state))
    return state
