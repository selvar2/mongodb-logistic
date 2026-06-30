# ResilioChain — Technical Documentation

> Agentic AI for supply-chain disruption response — **MongoDB Atlas** (the core data + AI retrieval layer) + **LangGraph** multi-agent orchestration + **AWS Bedrock** (Claude).

---

## 1. Overview

When a typhoon closes a port, a war disrupts a region, or sanctions block a supplier, ResilioChain ingests the disruption alert and runs a five-agent AI workflow that:

1. **Classifies** the disruption severity and scope (Supervisor).
2. **Computes the blast radius** — which orders, SKUs, and suppliers are impacted — using a MongoDB `$graphLookup` over an order → supplier dependency graph (Impact Assessor).
3. **Sources alternatives** — semantically matches backup suppliers with `$vectorSearch`, hard-filtered by required capacity (Sourcing).
4. **Vets compliance** — runs Vector **RAG** against ESG / sanctions / labour / carbon policies; loops back to sourcing when a candidate fails (max 3 retries) (Compliance).
5. **Compiles a mitigation brief** with a **deterministic confidence score** and an auto-execute / human-review recommendation (Mitigation Planner).

Every decision is checkpointed and written to an append-only audit trail. MongoDB Atlas is the system of record and the AI retrieval engine — agents touch the database **only** through a fixed set of MCP tools.

### Demo scenario
> Typhoon Yagi closes the Port of Tanjung Pelepas (Malaysia) for 72h. Primary supplier **SUP-001** (Chang Electronics) cannot fulfil 23 active orders totalling 48,200 units of automotive-grade MCUs. ResilioChain rejects **SUP-FAIL** (Vietnam, failing ESG) and recommends **SUP-002** (PT Maju Jaya, Indonesia) as the compliant alternative.

### Technology stack

| Layer | Tech |
|---|---|
| UI | Next.js 14, React, Tailwind, Framer Motion |
| Orchestration | LangGraph multi-agent state machine (Python) |
| Backend / API | FastAPI |
| Data & AI retrieval | MongoDB Atlas — `$graphLookup`, `$vectorSearch`, Vector RAG, checkpoints |
| LLM | AWS Bedrock — Claude Haiku 4.5 (provider-abstracted) |

---

## 2. Architecture (5 layers)

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1. EXTERNAL TRIGGER & OBSERVABILITY                                    │
│    Disruption alert (API / UI / external system) ──► workflow start    │
│    Telemetry, traces, agent decisions ──► audit_logs (+ console logs)  │
└───────────────────────────────┬──────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 2. LANGGRAPH ORCHESTRATION LAYER  (Python state machine)               │
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
│    M4 agent_checkpoints + mitigation_plans   audit_logs  disruptions   │
└──────────────────────────────────────────────────────────────────────┘
                                 ▲
┌──────────────────────────────────────────────────────────────────────┐
│ 4. AWS BEDROCK LLM LAYER  — Claude Haiku 4.5 (provider-abstracted)     │
│    Each agent calls the LLM for classification / extraction / planning │
└──────────────────────────────────────────────────────────────────────┘
                                 ▲
┌──────────────────────────────────────────────────────────────────────┐
│ 5. ENTERPRISE UI  — Next.js dashboard, live workflow stream, brief     │
└──────────────────────────────────────────────────────────────────────┘
```

**MCP tools (data-access boundary).** Agents may ONLY touch MongoDB through these:
`blast_radius_query` (`$graphLookup`) · `supplier_vector_search` (`$vectorSearch`) · `compliance_rag_query` (vector RAG) · `read_checkpoint` / `write_checkpoint` · `write_plan` / `update_plan_status`.

---

## 3. DisruptionState (shared graph state)

A single `TypedDict` threaded through every node and persisted as checkpoints (M4). Defined in `backend/app/agents/state.py`.

| Field | Set by | Meaning |
|---|---|---|
| `thread_id` | intake | workflow identity |
| `alert_text` | intake | raw disruption description |
| `severity` | Supervisor | `LOW` / `MEDIUM` / `HIGH` / `CRITICAL` |
| `affected_region`, `affected_supplier_id`, `affected_route` | Supervisor | extracted scope |
| `affected_skus[]`, `impacted_orders[]`, `required_capacity` | Impact Assessor | blast radius (capacity = SUM of `quantity_remaining`) |
| `candidate_suppliers[]`, `sourcing_query` | Sourcing | vector-matched, capacity-filtered backups |
| `compliance_results[]`, `vetted_suppliers[]`, `rejected_supplier_ids[]` | Compliance | per-supplier pass/fail + reasons |
| `compliance_retries` | graph | loop counter (≤ `COMPLIANCE_MAX_RETRIES`) |
| `mitigation_brief`, `confidence_score`, `recommended_action` | Planner | final output (`AUTO_EXECUTE` \| `HUMAN_REVIEW`) |
| `status`, `error` | graph | `running` \| `complete` \| `halted_no_impact` \| `escalated_hitl` |

---

## 4. MongoDB schema

Database: **`resiliochain`** (Atlas cluster0). Collection names are defined in `backend/app/config.py`.

### M1 — `orders` (source for `blast_radius_query` `$graphLookup`)

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | auto |
| `order_number` | String | `ORD-1044` … `ORD-1073`, unique |
| `status` | String | `active` (only active orders appear in blast radius) |
| `sku_ids` | String[] | e.g. `["MCU-32X","SEN-IMU9","CAP-470UF"]` |
| `supplier_id` | String | matches a `suppliers._id` — **graph edge** |
| `quantity_ordered` | Number | 5,000–20,000 |
| `quantity_remaining` | Number | 80–95% of ordered (partial fulfilment) |
| `route` | Object | `{ origin, destination, via_port }` |
| `bom` | Object | polymorphic microchip BOM `{ part_number, spec, grade }` |
| `depends_on` | String[] | `[supplier_id]` — **the `$graphLookup` edge field** |
| `unit_price` | Number | original price (for cost-variance calc) |
| `created_at` | Date | within last 90 days |

**Indexes:** `{supplier_id:1}`, `{status:1}`, `{depends_on:1}`, `{order_number:1}` (unique).

### M2 — `suppliers` (source for `supplier_vector_search` `$vectorSearch`)

| Field | Type | Notes |
|---|---|---|
| `_id` | String | `SUP-001` (disrupted) … `SUP-020` |
| `name` | String | e.g. `PT Maju Jaya Electronics` |
| `capabilities` | String[] | `["automotive-grade microcontrollers","32-bit MCU","AEC-Q100 certified"]` |
| `capacity_units_month` | Number | ≥ 48,200 for ≥2 backups (hard filter) |
| `geo_region` | String | `Indonesia`, `Malaysia`, `South Korea`, `Vietnam` |
| `lead_time_days` | Number | 14–45 |
| `esg_score` | Number | SUP-FAIL = 22; others 65–92 |
| `certifications` | String[] | `["ISO-14001","carbon-neutral-2024"]` |
| `unit_price` | Number | 5–15% above original |
| `embed_text` | String | name + capabilities (input for embedding) |
| `embedding` | Float[] | **auto-generated by Atlas Voyage AI** (autoEmbed) — do not populate manually |
| `last_updated` | Date | now |

### M3 — `compliance_policies` (source for `compliance_rag_query` vector RAG)

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | auto |
| `source_doc` | String | `2025_ESG_Guidelines.pdf`, `Trade_Sanctions_2025.pdf`, `Labour_Standards.pdf` |
| `chunk_index` | Number | 0-based within source |
| `text` | String | 300–500 token policy chunk |
| `policy_type` | String | `ESG` \| `trade_sanction` \| `labour` \| `carbon` |
| `embedding` | Float[] | auto-generated (Voyage AI) |
| `effective_date` | Date | 2025-01-01 |

### M4 — `agent_checkpoints` + `mitigation_plans`

- **`agent_checkpoints`** — LangGraph thread memory: `{ thread_id, ts, node, state }`.
- **`mitigation_plans`** — written by the Planner via `write_plan`:
  `{ plan_id, thread_id, affected_orders_count, backup_supplier, reroute_via, lead_time_delta_days, cost_variance_usd, cost_variance_pct, esg_status, confidence_score, recommended_action, options[], status, created_at }`.

### `audit_logs`
Append-only decision trail: `{ ts, thread_id, agent, action, input_summary, output_summary, level }`.

### `disruptions`
Intake records: `{ _id, alert_text, region, product, supplier_id, issue, created_at, status }`.

### Vector index definitions

**`supplier_vector_index`** (type `vectorSearch`, on `suppliers`):
- `embedding` — autoEmbed (Voyage AI) over `embed_text`, **cosine** similarity.
- `filter` fields: `capacity_units_month`, `geo_region`, `esg_score`.

**`policy_vector_index`** (type `vectorSearch`, on `compliance_policies`):
- `embedding` — autoEmbed (Voyage AI) over `text`.
- `filter` field: `policy_type`.

### Embedding strategy & fallback

- **Default `EMBEDDING_MODE=autoembed`:** Atlas manages Voyage AI (`voyage-4`) embeddings at index/query time; the app inserts only `embed_text` / `text`.
- **Fallback `EMBEDDING_MODE=explicit`:** if the cluster tier does not support autoEmbed Preview, `seed.py` calls Voyage AI (`VOYAGE_API_KEY`) to populate `embedding` at insert, and the vector index switches from `autoEmbed` to a plain `vector` field of matching dimensions. The query stages in the MCP tools are identical either way (`query.text` for autoembed vs `queryVector` for explicit).

---

## 5. The three MongoDB AI pipelines

### Pipeline 1 — `$graphLookup` blast radius (`blast_radius_query.py`)

Given a disrupted supplier id, traverse `orders.depends_on → suppliers._id`, keep orders whose dependency chain includes the disrupted supplier, then aggregate the impacted orders, the unique affected SKUs, and `required_capacity` = SUM of `quantity_remaining`.

```python
pipeline = [
    {"$match": {"status": "active"}},
    {"$graphLookup": {
        "from": settings.COL_SUPPLIERS,
        "startWith": "$depends_on",
        "connectFromField": "depends_on",
        "connectToField": "_id",
        "as": "dependency_chain",
    }},
    {"$match": {"dependency_chain._id": affected_supplier_id}},
    {"$group": {
        "_id": None,
        "impacted_orders": {"$push": {
            "order_number": "$order_number", "sku_ids": "$sku_ids",
            "quantity_remaining": "$quantity_remaining",
            "route": "$route", "unit_price": "$unit_price",
        }},
        "all_skus": {"$push": "$sku_ids"},
        "required_capacity": {"$sum": "$quantity_remaining"},
    }},
]
```

Empty result → `{affected_skus: [], impacted_orders: [], required_capacity: 0}` and the workflow halts (`halted_no_impact`).

### Pipeline 2 — `$vectorSearch` sourcing with capacity filter (`supplier_vector_search.py`)

Semantic recall over `suppliers` with a **hard capacity filter enforced at the query level** (not by the LLM). The disrupted supplier (and optionally its region) is excluded after retrieval because `_id` cannot be a vector-filter field. `similarity_score` is projected from `$meta: "vectorSearchScore"`.

```python
vfilter = {"capacity_units_month": {"$gte": int(required_capacity)}}

# autoembed mode (default)
stage = {"$vectorSearch": {
    "index": settings.IDX_SUPPLIER_VECTOR,
    "path": "embed_text",
    "query": {"text": query_text},
    "filter": vfilter,
    "numCandidates": 100,
    "limit": top_k,            # default 3
}}
# explicit mode swaps to "path": "embedding" + "queryVector": embed_query(query_text)

pipeline = [stage,
    {"$match": {"_id": {"$ne": exclude_supplier_id},
                "geo_region": {"$ne": exclude_region}}},   # post-filter
    {"$project": {"_id": 1, "name": 1, "capabilities": 1,
                  "capacity_units_month": 1, "geo_region": 1,
                  "lead_time_days": 1, "esg_score": 1, "certifications": 1,
                  "unit_price": 1,
                  "similarity_score": {"$meta": "vectorSearchScore"}}},
]
```

### Pipeline 3 — Vector RAG compliance (`compliance_rag_query.py`)

For a candidate supplier, build a query from its `geo_region` + `capabilities`, retrieve the most relevant policy chunks (optionally filtered by `policy_type`), and hand them to the Compliance Agent to reason over ESG / sanctions / labour / carbon dimensions.

```python
query_text = (f"{region} supplier ESG labour sanctions carbon compliance for "
              f"automotive electronics {caps}")

vs = {"index": settings.IDX_POLICY_VECTOR, "path": "text",
      "query": {"text": query_text}, "numCandidates": 100, "limit": top_k}  # default 5
if policy_type:
    vs["filter"] = {"policy_type": policy_type}

pipeline = [
    {"$vectorSearch": vs},
    {"$project": {"_id": 0, "source_doc": 1, "policy_type": 1, "text": 1,
                  "score": {"$meta": "vectorSearchScore"}}},
]
```

**Rate-limit handling.** All vector pipelines run through `_vs.run_vector_pipeline`, which retries on Voyage AI rate-limit errors (free tier: 3 RPM / 10K TPM) with spacing (`base_sleep` ≈ 21s, up to 4 attempts).

---

## 6. Agent workflow

Five LangGraph nodes (`backend/app/agents/`). Each takes structured JSON in/out, writes to `audit_logs`, and fails gracefully. Models are config-driven and default to Bedrock Claude Haiku 4.5.

| Agent | Model | Role | MCP tools |
|---|---|---|---|
| **A. Supervisor** | Sonnet→Haiku | Classifies severity, extracts scope, routes workers; on the 2nd pass compiles the brief and decides auto-approve vs HITL. | `read_checkpoint`, `write_checkpoint`, `write_plan` |
| **B. Impact Assessor** | Haiku | Computes blast radius via `$graphLookup`; aggregates `required_capacity`. Never invents orders. | `blast_radius_query` |
| **C. Sourcing** | Haiku | `$vectorSearch` for backups with hard capacity filter; top-3 by similarity. | `supplier_vector_search` |
| **D. Compliance** | Haiku | Vector RAG over policies; validates each candidate iteratively. | `compliance_rag_query` |
| **E. Mitigation Planner** | Sonnet→Haiku | Selects top vetted supplier, computes cost variance, assigns deterministic confidence, writes plan. | `write_plan`, `update_plan_status`, `read_checkpoint` |

### Graph wiring & conditional-edge retry logic (`graph.py`)

```python
g.set_entry_point("supervisor")
g.add_edge("supervisor", "impact_assessor")
g.add_conditional_edges("impact_assessor", _after_impact,
                        {"halt": END, "sourcing": "sourcing"})
g.add_edge("sourcing", "compliance")
g.add_conditional_edges("compliance", _after_compliance,
                        {"planner": "planner", "retry_sourcing": "sourcing"})
g.add_edge("planner", END)
```

```python
def _after_impact(state):
    return "halt" if state.get("status") == "halted_no_impact" else "sourcing"

def _after_compliance(state):
    if state.get("vetted_suppliers"):
        return "planner"
    if state.get("compliance_retries", 0) < settings.compliance_max_retries \
            and state.get("candidate_suppliers"):
        return "retry_sourcing"           # loop back for the next-best candidate
    return "planner"                       # planner escalates to HITL (no vetted suppliers)
```

- **Conditional edge (Compliance → Sourcing):** if no candidate passes, loop back to Sourcing for the next-best vector match. After 3 retries (`COMPLIANCE_MAX_RETRIES`) → planner escalates to HITL.
- **Impact halt:** empty blast radius → END (no Sourcing).
- **Supervisor HITL gate:** the brief cannot be compiled until `impacted_orders[]`, `candidate_suppliers[]`, and `compliance_results[]` are populated.
- A `recursion_limit` of 25 guards against unexpected loops.

---

## 7. Deterministic confidence formula

Confidence is computed in `backend/app/agents/confidence.py` — **never produced by the LLM.** Vector similarity from autoEmbed is a weak signal for short supplier texts, so it is used only for candidate recall in sourcing, not for the final score.

```
confidence (0-100) =
    0.35 * esg_component        (esg_score / 100)
  + 0.30 * cost_component       (1 - clamp(|cost_variance_pct| / 40))
  + 0.15 * capacity_component   (clamp((capacity - required) / required, 0, 1))
  + 0.10 * leadtime_component   (1 - clamp(lead_time_days / 60))
  + 0.10 * compliance_component (1.0 if all compliance dimensions PASS else 0.0)
```

```python
def compute_confidence(*, esg_score, cost_variance_pct, capacity_units_month,
                       required_capacity, lead_time_days, compliance_passed) -> int:
    esg_c  = _clamp(esg_score / 100.0)
    cost_c = _clamp(1.0 - abs(cost_variance_pct) / 40.0)
    headroom = ((capacity_units_month - required_capacity) / required_capacity
                if required_capacity else 0.0)
    cap_c  = _clamp(headroom)
    lead_c = _clamp(1.0 - lead_time_days / 60.0)
    comp_c = 1.0 if compliance_passed else 0.0
    score  = 100.0 * (0.35*esg_c + 0.30*cost_c + 0.15*cap_c + 0.10*lead_c + 0.10*comp_c)
    return int(round(score))
```

**recommended_action:**
```python
def decide_action(confidence, esg_score) -> str:
    if confidence >= settings.confidence_auto_threshold and esg_score >= 60:
        return "AUTO_EXECUTE"
    return "HUMAN_REVIEW"
```
`AUTO_EXECUTE` only if confidence ≥ `CONFIDENCE_AUTO_THRESHOLD` (default 85) **AND** `esg_score ≥ 60`; otherwise HITL (`HUMAN_REVIEW`) is mandatory.

---

## 8. Setup & installation

### Prerequisites
- Python 3.11+, Node.js 18+
- A MongoDB Atlas cluster with Vector Search enabled
- AWS Bedrock access (Claude Haiku 4.5) — static keys or an IAM role

### Environment variables (`.env`)

Copy `.env.example` → `.env` and fill in real values. **Key names only — never commit secret values.**

| Key | Purpose |
|---|---|
| `MONGODB_URI` | Atlas connection string |
| `MONGODB_DB` | database name (`resiliochain`) |
| `AWS_ACCESS_KEY_ID` | Bedrock credential (or use IAM role) |
| `AWS_SECRET_ACCESS_KEY` | Bedrock credential |
| `AWS_REGION` | Bedrock region (e.g. `us-east-1`) |
| `BEDROCK_MODEL_ID` | default model id (Claude Haiku 4.5) |
| `BEDROCK_MODEL_SUPERVISOR` | optional per-agent override |
| `BEDROCK_MODEL_PLANNER` | optional per-agent override |
| `LLM_MODE` | `bedrock` \| `mock` |
| `EMBEDDING_MODE` | `autoembed` \| `explicit` |
| `VOYAGE_API_KEY` | required only in `explicit` mode |
| `VOYAGE_MODEL` | embedding model (`voyage-4`) |
| `API_HOST` | bind host (`0.0.0.0`) |
| `API_PORT` | API port (use `8010`; see note below) |
| `CONFIDENCE_AUTO_THRESHOLD` | auto-execute threshold (default `85`) |
| `COMPLIANCE_MAX_RETRIES` | sourcing↔compliance retry cap (default `3`) |

> **Port note:** the canonical API port is **8010** (8000 was occupied by another local service). Set `NEXT_PUBLIC_API_BASE=http://localhost:8010` for the frontend.

### Install & run

**Backend** (virtualenv + uvicorn on port 8010):
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m app.db.seed              # load demo dataset into Atlas
python -m app.db.indexes           # create vector + graph indexes
python -m app.agents.graph --demo  # run the Typhoon-Yagi scenario end-to-end
uvicorn app.main:app --reload --host 0.0.0.0 --port 8010
```

**Frontend** (Next.js on port 3000):
```bash
cd frontend
npm install
NEXT_PUBLIC_API_BASE=http://localhost:8010 npm run dev   # http://localhost:3000
```

---

## 9. API reference

Base URL: `http://localhost:8010`. All responses are clean JSON. Errors: `{ "error": { "code", "message" } }` with the proper HTTP status.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness + MongoDB ping + LLM mode |
| POST | `/disruptions` | Create a disruption alert (intake) → returns `disruption_id` |
| GET | `/disruptions` | List disruption alerts |
| GET | `/disruptions/{id}` | Get one disruption + its latest workflow result |
| POST | `/workflow/run` | Run the LangGraph workflow (returns final state) |
| GET | `/workflow/stream/{thread_id}` | **SSE** stream of agent steps as they execute |
| GET | `/suppliers/classify` | Supplier impact classification view data |
| GET | `/audit-logs` | Audit trail (filter by `thread_id`) |
| GET | `/checkpoints/{thread_id}` | Checkpoint history for a workflow thread |
| GET | `/plans/{thread_id}` | Mitigation plan(s) for a thread |
| GET | `/pipelines` | Metadata about the three MongoDB AI pipelines |

### GET `/health`
```json
{ "status": "ok", "mongodb": "connected", "llm_mode": "bedrock",
  "embedding_mode": "autoembed", "db": "resiliochain" }
```

### POST `/disruptions`
Request:
```json
{ "eventType": "Typhoon", "region": "Tanjung Pelepas, Malaysia",
  "product": "Automotive-grade MCU", "supplier": "SUP-001",
  "issue": "Port closed 72h — supplier has stock but cannot deliver" }
```
Response:
```json
{ "disruption_id": "665f0a...c21", "status": "created" }
```

### POST `/workflow/run`
Request:
```json
{ "alert_text": "Typhoon Yagi has closed the Port of Tanjung Pelepas for 72 hours. SUP-001 cannot deliver 23 active orders totalling 48,200 units of automotive-grade MCUs." }
```
Response (final `DisruptionState`):
```json
{
  "thread_id": "demo-9f3a1c2b",
  "severity": "HIGH",
  "affected_supplier_id": "SUP-001",
  "affected_region": "Malaysia",
  "impacted_orders": [
    { "order_number": "ORD-1044", "sku_ids": ["MCU-32X"],
      "quantity_remaining": 4200, "unit_price": 3.10 }
  ],
  "required_capacity": 48200,
  "candidate_suppliers": [
    { "supplier_id": "SUP-FAIL", "name": "...", "similarity_score": 0.51,
      "geo_region": "Vietnam", "esg_score": 22 },
    { "supplier_id": "SUP-002", "name": "PT Maju Jaya Electronics",
      "similarity_score": 0.49, "geo_region": "Indonesia", "esg_score": 88 }
  ],
  "compliance_results": [
    { "supplier_id": "SUP-FAIL", "passed": false,
      "fail_reasons": ["Vietnam labour/ESG risk"] },
    { "supplier_id": "SUP-002", "passed": true }
  ],
  "vetted_suppliers": [ { "supplier_id": "SUP-002", "esg_score": 88 } ],
  "mitigation_brief": {
    "plan_id": "PLAN-7c2a", "affected_orders_count": 23,
    "backup_supplier": "SUP-002", "backup_supplier_name": "PT Maju Jaya Electronics",
    "reroute_via": "Port of Tanjung Priok", "lead_time_delta_days": 6,
    "cost_variance_usd": 33740, "cost_variance_pct": 7.0,
    "esg_status": "PASS", "confidence_score": 88,
    "recommended_action": "AUTO_EXECUTE", "options": []
  },
  "confidence_score": 88,
  "recommended_action": "AUTO_EXECUTE",
  "status": "complete"
}
```

### GET `/workflow/stream/{thread_id}` (SSE)
Server-Sent Events; each agent step is one `data:` event.
```
event: step
data: {"agent":"supervisor","action":"classify","severity":"HIGH"}

event: step
data: {"agent":"impact_assessor","action":"blast_radius","impacted_orders":23,"required_capacity":48200}

event: step
data: {"agent":"sourcing","action":"vector_search","candidates":3}

event: step
data: {"agent":"compliance","action":"vet","supplier_id":"SUP-FAIL","passed":false}

event: step
data: {"agent":"compliance","action":"vet","supplier_id":"SUP-002","passed":true}

event: done
data: {"status":"complete","recommended_action":"AUTO_EXECUTE","confidence_score":88}
```

### GET `/audit-logs?thread_id=demo-9f3a1c2b`
```json
[
  { "ts": "2026-06-30T10:02:11Z", "thread_id": "demo-9f3a1c2b",
    "agent": "system", "action": "workflow_start",
    "input_summary": "Typhoon Yagi...", "level": "info" },
  { "ts": "2026-06-30T10:02:14Z", "thread_id": "demo-9f3a1c2b",
    "agent": "compliance", "action": "vet",
    "output_summary": "SUP-FAIL rejected: Vietnam labour/ESG risk", "level": "info" }
]
```

### GET `/plans/{thread_id}`
```json
[
  { "plan_id": "PLAN-7c2a", "thread_id": "demo-9f3a1c2b",
    "affected_orders_count": 23, "backup_supplier": "SUP-002",
    "reroute_via": "Port of Tanjung Priok", "lead_time_delta_days": 6,
    "cost_variance_usd": 33740, "cost_variance_pct": 7.0,
    "esg_status": "PASS", "confidence_score": 88,
    "recommended_action": "AUTO_EXECUTE", "status": "PROPOSED",
    "options": [], "created_at": "2026-06-30T10:02:20Z" }
]
```

### GET `/pipelines`
```json
[
  { "id": "blast_radius_query", "operator": "$graphLookup", "collection": "orders",
    "purpose": "Compute blast radius over the order→supplier dependency graph" },
  { "id": "supplier_vector_search", "operator": "$vectorSearch", "collection": "suppliers",
    "index": "supplier_vector_index", "purpose": "Semantic sourcing with hard capacity filter" },
  { "id": "compliance_rag_query", "operator": "$vectorSearch", "collection": "compliance_policies",
    "index": "policy_vector_index", "purpose": "Vector RAG over ESG/sanctions/labour/carbon policy" }
]
```

---

## 10. Deployment guide

### Local
- Backend: `uvicorn app.main:app --reload --port 8010`.
- Frontend: `npm run dev` (port 3000), with `NEXT_PUBLIC_API_BASE=http://localhost:8010`.

### Production
- **Backend:** containerize FastAPI (Dockerfile, gunicorn + uvicorn workers) → AWS ECS/Fargate, Fly.io, or Render. Prefer an **IAM role for Bedrock** over static keys.
- **Frontend:** Vercel (Next.js native) → set `NEXT_PUBLIC_API_BASE` to the deployed API URL.
- **MongoDB:** Atlas (already managed); ensure both Vector Search indexes are **ACTIVE**; restrict the network access list; use a least-privilege DB user.

### Pre-deploy checklist
- [ ] Rotate any credentials shared during development.
- [ ] `supplier_vector_index` + `policy_vector_index` ACTIVE.
- [ ] Seed data loaded (or production data migrated).
- [ ] `pytest` green; `/health` returns `ok`.
- [ ] CORS allows the frontend origin.

---

## 11. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Voyage rate limit` / `429` in vector search logs | Free-tier autoEmbed cap (3 RPM / 10K TPM) | `_vs.run_vector_pipeline` already retries with ~21s spacing; add a payment method to Atlas/Voyage to lift the limit, or set `EMBEDDING_MODE=explicit` with a `VOYAGE_API_KEY` to control batching. |
| API won't bind — port 8000 already in use | Another local service holds 8000 | Run on **8010**: `uvicorn app.main:app --port 8010` and set `NEXT_PUBLIC_API_BASE=http://localhost:8010`. |
| `/health` shows `mongodb: disconnected` / connection timeout | Bad `MONGODB_URI`, IP not allowlisted, or wrong DB user | Verify the SRV string and `MONGODB_DB`; add your IP to the Atlas Network Access list; confirm the DB user/password and least-privilege role. |
| Vector search returns nothing | Indexes not built or still building | Run `python -m app.db.indexes`; confirm both indexes are ACTIVE in Atlas before querying. |
| Workflow halts with `halted_no_impact` | Blast radius query returned empty | Confirm seed data loaded and that orders' `depends_on` points at the disrupted `supplier_id`. |
| All candidates rejected → `escalated_hitl` | No compliant supplier within 3 retries | Expected guardrail; review `audit_logs` for `fail_reasons` and the brief's `options[]`. |

---

*Generated for the ResilioChain project. Ground truth: `ARCHITECTURE.md`, `MONGODB_SCHEMA.md`, `AGENTS.md`, `API_SPEC.md`, `backend/app/agents/*`, `backend/app/mcp_tools/*`.*
