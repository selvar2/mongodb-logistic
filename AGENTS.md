# AGENTS.md — Agent Contracts

Five LangGraph nodes. Each: structured JSON in/out, writes to `audit_logs`, fails gracefully.
Models are config-driven (`backend/app/config.py`); all default to Bedrock Claude Haiku 4.5.

---

## A. Supervisor Agent  (model: Sonnet→Haiku)
- **Role:** "brain of the squad." Reads the incoming disruption, classifies
  `severity ∈ {LOW,MEDIUM,HIGH,CRITICAL}`, extracts `affected_region`, `affected_supplier_id`,
  `affected_route`. Routes to workers. On the **second pass**, compiles the ranked mitigation
  brief and decides auto-approve vs HITL.
- **In:** `alert_text`. **Out:** `severity, affected_region, affected_supplier_id, affected_route`,
  and later `final_mitigation_brief`.
- **MCP tools:** `read_checkpoint`, `write_checkpoint`, `write_plan`.
- **Guardrail:** cannot compile brief until `impacted_orders[]`, `candidate_suppliers[]`,
  `compliance_results[]` are populated (LangGraph conditional edge enforces it).

## B. Impact Assessor Agent  (Haiku)
- **Role:** computes full **blast radius**. Calls `blast_radius_query` (`$graphLookup` over
  orders → `depends_on` → disrupted supplier). Aggregates `quantity_remaining` by SKU category to
  compute `required_capacity` (the minimum supplier capacity needed).
- **In:** `affected_supplier_id`, `affected_route`.
- **Out:** `affected_skus[]`, `impacted_orders[]`, `required_capacity` (SUM of quantity_remaining).
- **MCP tools:** `blast_radius_query` only. **Guardrail:** never invents orders; if query returns
  empty → `{affected_skus:[], impacted_orders:[], required_capacity:0}` and halt (no Sourcing).

## C. Sourcing Agent  (Haiku)
- **Role:** finds semantically matching backups. Calls `supplier_vector_search` (`$vectorSearch`
  on `suppliers.embedding`) with `required_capacity` as a **hard capacity filter**. Returns top-3
  ranked candidates by similarity.
- **In:** `affected_skus[]`, `required_capacity`.
- **Out:** `candidate_suppliers[]` (`supplier_id, name, similarity_score, capacity_units_month,
  geo_region, lead_time_days, esg_score, certifications[]`).
- **MCP tools:** `supplier_vector_search` only. **Guardrail:** cannot return a supplier not in the
  collection; capacity filter enforced at the query level, not by the LLM.

## D. Compliance Agent  (Haiku)
- **Role:** validates each candidate against ESG / trade-sanction / labour / carbon policy via
  `compliance_rag_query` (vector RAG over `compliance_policies`). Analyzes retrieved chunks against
  the supplier's `geo_region` + `certifications`.
- **In:** `candidate_suppliers[]` (one at a time, iteratively).
- **Out:** `compliance_result {supplier_id, passed, esg_status, sanctions_status, labour_status,
  carbon_status, fail_reasons[]}`; on pass → appended to `vetted_suppliers[]`.
- **MCP tools:** `compliance_rag_query` only. **Guardrail:** if `passed=false`, conditional edge
  routes back to Sourcing (max 3 retries) for the next candidate; if all fail → HITL escalation.

## E. Mitigation Planner  (Supervisor 2nd pass; Sonnet→Haiku)
- **Role:** final node. Reads complete state, selects the top vetted supplier, computes
  `cost_variance = (backup.unit_price − original.unit_price) × required_capacity`, assigns a
  **deterministic** `confidence_score (0–100)` from similarity + ESG + cost margin. Writes plan.
- **Out:** `mitigation_brief {plan_id, affected_orders_count, backup_supplier, reroute_via,
  lead_time_delta_days, cost_variance_usd, cost_variance_pct, esg_status, confidence_score,
  recommended_action, options[]}`.
- **MCP tools:** `write_plan`, `update_plan_status`, `read_checkpoint`.
- **Guardrail:** cannot compile until `vetted_suppliers[]` has ≥1 `passed=true`. Confidence formula
  is enforced in tool/code (not LLM). `recommended_action = AUTO_EXECUTE if confidence ≥ 85 else
  HUMAN_REVIEW`; HITL mandatory if confidence < 85 OR any vetted supplier `esg_score < 60`.
