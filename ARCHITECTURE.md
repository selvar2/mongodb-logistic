# ARCHITECTURE.md — ResilioChain

## System layers

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1. EXTERNAL TRIGGER & OBSERVABILITY                                    │
│    Disruption alert (API / UI / external system) ──► workflow start    │
│    Telemetry, traces, agent decisions ──► audit_logs (+ console logs)  │
└───────────────────────────────┬──────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 2. LANGGRAPH ORCHESTRATION LAYER  (Python state machine)               │
│                                                                        │
│        ┌────────────────┐  decides next node on DisruptionState        │
│        │  A. SUPERVISOR │◄──────────────────────────────────────┐      │
│        └───────┬────────┘                                        │      │
│      classify  │ route                                           │      │
│                ▼                                                 │      │
│   ┌────────────────────┐   ┌───────────────┐   ┌─────────────┐  │      │
│   │ B. Impact Assessor │──►│ C. Sourcing   │──►│ D. Compliance│─┘      │
│   │  $graphLookup      │   │ $vectorSearch │◄──│  Vector RAG  │  retry │
│   └────────────────────┘   └───────────────┘   └──────┬──────┘ (≤3)   │
│                                                        ▼               │
│                                          ┌──────────────────────────┐  │
│                                          │ E. Mitigation Planner     │ │
│                                          │ deterministic confidence  │ │
│                                          │ + HITL gate               │ │
│                                          └──────────────────────────┘  │
└───────────────────────────────┬──────────────────────────────────────┘
                                 ▼  (every node reads/writes via MCP tools)
┌──────────────────────────────────────────────────────────────────────┐
│ 3. MONGODB ATLAS — THE CORE                                            │
│    M1 orders (graph)  M2 suppliers (vector)  M3 compliance (RAG)       │
│    M4 agent_checkpoints + mitigation_plans   audit_logs                │
└──────────────────────────────────────────────────────────────────────┘
                                 ▲
┌──────────────────────────────────────────────────────────────────────┐
│ 4. AWS BEDROCK LLM LAYER  — Claude Haiku 4.5 (provider-abstracted)     │
│    Each agent calls the LLM for classification / extraction / planning │
└──────────────────────────────────────────────────────────────────────┘
```

## DisruptionState (shared graph state)
A single dict threaded through every node, persisted as checkpoints (M4):

| Field | Set by | Meaning |
|---|---|---|
| `alert_text` | intake | raw disruption description |
| `severity` | Supervisor | LOW / MEDIUM / HIGH / CRITICAL |
| `affected_region`, `affected_supplier_id`, `affected_route` | Supervisor | extracted scope |
| `affected_skus[]`, `impacted_orders[]`, `required_capacity` | Impact Assessor | blast radius |
| `candidate_suppliers[]` | Sourcing | vector-matched, capacity-filtered backups |
| `compliance_results[]`, `vetted_suppliers[]` | Compliance | per-supplier pass/fail + reasons |
| `mitigation_brief`, `confidence_score`, `recommended_action` | Planner | final output |
| `compliance_retries` | graph | loop counter (≤ `COMPLIANCE_MAX_RETRIES`) |

## Control flow & guardrails
- **Conditional edge (Compliance → Sourcing):** if no candidate passes, loop back to Sourcing
  for the next-best vector match. After 3 retries → escalate to HITL.
- **Supervisor HITL gate:** Supervisor cannot compile the final brief until `impacted_orders[]`,
  `candidate_suppliers[]`, and `compliance_results[]` are populated.
- **Deterministic confidence:** computed in `agents/confidence.py` from similarity score, ESG
  rating, and cost variance — never produced by the LLM.
- **recommended_action:** `AUTO_EXECUTE` if confidence ≥ 85; else `HUMAN_REVIEW`. HITL is forced
  if confidence < 85 OR any vetted supplier has esg_score < 60.

## MCP tools (data-access boundary)
`blast_radius_query` ($graphLookup) · `supplier_vector_search` ($vectorSearch) ·
`compliance_rag_query` (vector RAG) · `read_checkpoint` / `write_checkpoint` ·
`write_plan` / `update_plan_status`. Agents may ONLY touch MongoDB through these.

See [AGENTS.md](AGENTS.md) for per-agent contracts and [MONGODB_SCHEMA.md](MONGODB_SCHEMA.md)
for collection schemas and index definitions.
