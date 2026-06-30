# ResilioChain — Hands-On Guide: Disruption Intake & Alternative Supplier Search

> A first-time user's guide to driving the two main screens — **Disruption Intake** and
> **Alternative Supplier Search** — and to **simulating positive and negative scenarios**
> on purpose so you can see exactly how the agents react.

If you have never used ResilioChain before, read this top to bottom once. Every code block in the
HTML version of this guide (`docs/hands-on-guide.html`) has a **Copy** button.

---

## 1. The world you are simulating

ResilioChain ships with a small, deterministic demo dataset (15 suppliers, 30 orders, a
compliance policy library) seeded into MongoDB Atlas. Everything in this guide refers to that
seed data, so your results will match exactly.

The story: a **typhoon closes the Port of Tanjung Pelepas (Malaysia)**. Primary supplier
**SUP-001 (Chang Electronics)** has stock but cannot ship — **23 active orders / 48,200 units**
are stuck. ResilioChain must find a compliant backup supplier and produce a ranked, auditable
mitigation brief. The "right answer" is **SUP-002 (PT Maju Jaya, Indonesia)** wins, while
**SUP-FAIL (Vietnam, ESG 22)** is rejected on ESG.

You will reproduce that, then deliberately bend the inputs to get different outcomes.

---

## 2. The 5-agent pipeline in plain English

When you trigger a disruption, a LangGraph state machine runs five agents in order. Each writes
to an immutable `audit_logs` trail.

| # | Agent | What it does | MongoDB / AI feature |
|---|-------|--------------|----------------------|
| 1 | **Supervisor** | Reads your alert text, extracts severity, the affected **supplier ID**, and the affected **region**. | LLM (Bedrock) + regex fallback |
| 2 | **Impact Assessor** | Walks the order→supplier dependency graph to find every impacted order and the **total units required**. | `$graphLookup` (blast radius) |
| 3 | **Sourcing** | Semantically finds capable backup suppliers, hard-filtered by capacity and geography. | `$vectorSearch` |
| 4 | **Compliance** | Vets each candidate against ESG / labour / sanctions policy. | Vector RAG over policies |
| 5 | **Mitigation Planner** | Scores survivors with a **deterministic confidence formula** and recommends **AUTO_EXECUTE** or **HUMAN_REVIEW**. | tool-computed score |

> **Key idea:** the confidence score is *never* invented by the LLM — it is computed by a fixed
> formula (see §5). That is what makes outcomes reproducible.

---

## 3. Feature A — Disruption Intake

**Where:** left nav → **Disruption Intake**. This is how you *start* a run.

### 3.1 The form, field by field

| Field | Example (default) | What it actually controls |
|-------|-------------------|---------------------------|
| **Event Type** | `Typhoon` | Sets **severity**. Words like *typhoon, earthquake, war, closed, blockade* → HIGH/CRITICAL; *delay, congestion* → MEDIUM. |
| **Region** | `Tanjung Pelepas, Malaysia` | The **disrupted region**. Sourcing will **exclude** suppliers in this region (geographic diversification). |
| **Product** | `Automotive-grade MCU` | Descriptive context fed to the semantic search query. |
| **Supplier** | `SUP-001` | **The most important field.** This is the supplier that is down. The blast radius (impacted orders + required units) is computed from *this* supplier's orders. |
| **Issue** | `Port closed for 72h …` | Free-text context. **Note:** numbers you type here (e.g. "48,200 units") are *descriptive only* — see the Gotcha in §6. |

Behind the scenes the form is assembled into a single alert sentence:

```
{Event Type} affecting {Region}. Primary supplier {Supplier} is impacted. Product: {Product}. {Issue}
```

### 3.2 What happens when you click "Trigger Mitigation Workflow"

1. A disruption record is saved (`POST /disruptions`).
2. A background workflow starts (`POST /workflow/start`) and returns a `thread_id`.
3. You are redirected to **Agent Workflow** (`/workflow?thread_id=…`), which streams the agents
   live over Server-Sent Events (`GET /workflow/stream/{thread_id}`).

### 3.3 Reading the result (Mitigation Brief)

When the run finishes you get a brief with:

- **Backup Supplier (Winner)** — the recommended supplier, e.g. *PT Maju Jaya Electronics (SUP-002)*.
- **Confidence gauge** — 0–100.
- **Recommended Action**:
  - **AUTO_EXECUTE** — confidence ≥ 85 **and** winner ESG ≥ 60. The plan is safe to execute automatically.
  - **HUMAN_REVIEW** — anything else. A human should sign off.

---

## 4. Feature B — Alternative Supplier Search

**Where:** left nav → **Alternative Sourcing**. This screen shows **how** step 3 (Sourcing) finds
candidates, and it displays the compliance verdict per candidate.

### 4.1 The `$vectorSearch` pipeline (this is what runs)

```javascript
// Semantic sourcing — MongoDB Atlas $vectorSearch
// Voyage autoEmbed turns the disruption profile into a query vector
db.suppliers.aggregate([
  {
    $vectorSearch: {
      index: "suppliers_vs",
      path: "embed_text",           // Voyage autoEmbed field
      query: disruptionProfileText, // skus + capabilities needed
      numCandidates: 200,
      limit: 10,
      filter: {
        capacity_units_month: { $gte: requiredCapacity }, // hard filter
        supplier_id: { $ne: disruptedSupplierId },        // exclude disrupted
        geo_region:  { $ne: disruptedRegion }             // exclude region
      }
    }
  },
  { $set: { similarity_score: { $meta: "vectorSearchScore" } } },
  { $project: {
      supplier_id: 1, name: 1, geo_region: 1, esg_score: 1,
      lead_time_days: 1, capacity_units_month: 1, unit_price: 1,
      similarity_score: 1
  } }
])
```

Two layers do the work: **semantic recall** (vector similarity on `embed_text`) ranks suppliers
by how well they match the needed capabilities, and a **hard filter** guarantees every candidate
is physically feasible (enough capacity) and not in the disrupted region.

### 4.2 Reading the results table

Click **Run semantic sourcing**. Each candidate row gets a status badge:

| Badge | Meaning |
|-------|---------|
| **GOOD** | Passed compliance **and** is the rank-1 (best semantic match) → the proposed winner. |
| **ALTERNATIVE** | Passed compliance but is not rank-1 → a viable fallback. |
| **COMPLIANCE_BLOCKED** | Failed compliance (e.g. ESG too low) → rejected, shown so you can see *why*. |

> **Note:** the Alternative Sourcing screen always runs the **fixed canonical demo** (SUP-001
> typhoon). To search with *your own* inputs, use the API recipes in §7 — they accept any alert.

---

## 5. The rules that decide outcomes

These thresholds are deterministic. Memorize them and you can predict every result.

**Compliance (pass/fail):**

| Rule | Value |
|------|-------|
| ESG minimum to pass | **60** (ESG < 60 → FAIL) |
| Risk region | **Vietnam** — fails if ESG < 60 *or* missing `ISO-14001` |
| Sanctions | Always PASS in this build |

**Confidence formula (0–100), computed by the Planner:**

```
confidence = 100 * (
    0.35 * (esg_score / 100)                      # ESG quality
  + 0.30 * (1 - clamp(|cost_variance_pct| / 40))  # cost vs original
  + 0.15 * clamp((capacity - required) / required) # spare capacity headroom
  + 0.10 * (1 - clamp(lead_time_days / 60))        # speed
  + 0.10 * (1.0 if compliance_passed else 0.0)     # compliant?
)
```

**Action decision:** `AUTO_EXECUTE` if `confidence ≥ 85 AND esg ≥ 60`, otherwise `HUMAN_REVIEW`.

> **Why the headline demo lands on HUMAN_REVIEW:** for the big SUP-001 disruption the winner
> SUP-002 has only `(60,000 − 48,200) / 48,200 ≈ 24%` spare capacity, so the headroom term is
> small and confidence works out to **75**. Shrink the disruption and that same supplier sails
> past 85 (see the SUP-004 scenario in §6).

---

## 6. Scenario cookbook

Each scenario lists the **exact inputs** to enter on the **Disruption Intake** form and the
**verified outcome**. (All results below were confirmed against the running backend.)

### ✅ Scenario 1 — Canonical demo (a clean win, pending human sign-off)
**Inputs:** Event Type `Typhoon` · Region `Tanjung Pelepas, Malaysia` · Product `Automotive-grade MCU` · Supplier `SUP-001` · Issue *(anything)*
**Outcome:**
- Required capacity **48,200** units (23 impacted orders).
- **Winner: SUP-002 (PT Maju Jaya Electronics)**.
- **Blocked on ESG: SUP-FAIL (22), SUP-008 (35, Vietnam).**
- Confidence **75** → **HUMAN_REVIEW**.

This is the flagship run: a compliant alternative is found and an ESG offender is rejected, but
the thin capacity headroom keeps it just under the auto-execute bar.

### ✅ Scenario 2 — Small disruption → AUTO_EXECUTE
**Inputs:** Event Type `Flood` · Region `Bandung, Indonesia` · Supplier `SUP-004` · Issue *(anything)*
**Outcome:**
- Required capacity **9,625** units (1 impacted order).
- **Winner: SUP-002**, confidence **91** → **AUTO_EXECUTE**.

Same winner as Scenario 1, but because far fewer units are needed, the capacity-headroom term is
maxed out and confidence clears 85. **This is the cleanest "positive / auto-execute" demo.**

### ❌ Scenario 3 — ESG rejection (negative, by policy)
You don't need a special run — the rejection is visible in **every** SUP-001 run and on the
Alternative Sourcing table. Look for **SUP-FAIL** (Vina Components, Vietnam, **ESG 22**) and
**SUP-008** (Hanoi Circuits, Vietnam, **ESG 35**): both show **COMPLIANCE_BLOCKED** with a
fail reason like *"ESG score 22 is below the required minimum of 60"* and a Vietnam labour/ESG
policy citation. This demonstrates the guardrail doing its job.

### ❌ Scenario 4 — No impact (edge case)
**Inputs:** Event Type `Earthquake` · Region `Hanoi, Vietnam` · Supplier `SUP-008` · Issue *(anything)*
**Outcome:** Required capacity **0**, **0 impacted orders**, status **`halted_no_impact`**, no
brief produced.
**Why:** nothing in the order book depends on SUP-008, so there is no blast radius. This teaches
the most important mechanic: **impact is derived from the dependency graph, not from the words in
your alert.** Only these suppliers have dependent orders → only they produce a real run:

| Supplier | Impacted orders | Required units |
|----------|-----------------|----------------|
| SUP-001 | 23 | 48,200 |
| SUP-002 | 2 | 22,383 |
| SUP-003 | 2 | 18,616 |
| SUP-004 | 1 | 9,625 |
| SUP-006 | 1 | 4,976 |
| SUP-005 | 1 | 4,747 |
| *any other ID* | 0 | 0 → `halted_no_impact` |

### ⚠️ Scenario 5 — The region lever (changes the winner)
**Inputs:** same as Scenario 1 but set **Region** to `Indonesia`.
**Effect:** Sourcing excludes Indonesian suppliers, so **SUP-002 (Indonesia) is removed from
contention** and a different supplier (e.g. a South Korean one) becomes the winner. Use this to
show geographic diversification in action.

### Supplier cheat-sheet (seed data)

| ID | Region | ESG | Capacity/mo | Note |
|----|--------|-----|-------------|------|
| SUP-001 | Malaysia | 70 | 50,000 | the disrupted primary |
| **SUP-002** | Indonesia | **88** | 60,000 | **canonical winner** |
| SUP-003 | South Korea | 90 | 70,000 | strong alternative |
| SUP-004 | Indonesia | 81 | 52,000 | alternative |
| SUP-005 | South Korea | 84 | 48,500 | tight capacity |
| SUP-006 | Malaysia | 76 | 30,000 | below required for big runs |
| SUP-008 | Vietnam | **35** | 51,000 | **blocked: ESG + region** |
| SUP-009 | South Korea | 86 | 64,000 | alternative |
| SUP-011 | Malaysia | 72 | 58,000 | excluded if region = Malaysia |
| SUP-013 | Indonesia | 83 | 49,000 | alternative |
| **SUP-FAIL** | Vietnam | **22** | 55,000 | **blocked: ESG 22** |

### 🚩 Gotcha — units come from orders, not from your text
If you type *"need 200,000 units"* in the **Issue** box expecting a no-capacity failure, it will
**not** happen. The required capacity is the **sum of `quantity_remaining` across the orders that
depend on the chosen supplier** (`$graphLookup`). To change the required units, change the
**Supplier**, not the prose.

---

## 7. Copyable API recipes (run any scenario)

The backend listens on `http://localhost:8010`. If you are using GitHub Codespaces from another
machine, replace it with your forwarded backend URL (`https://<name>-8010.app.github.dev`).

**Health check**

```bash
curl http://localhost:8010/health
```

**Positive run (synchronous, returns the full final state)**

```bash
curl -X POST http://localhost:8010/workflow/run \
  -H 'Content-Type: application/json' \
  -d '{"alert_text":"Typhoon affecting Tanjung Pelepas, Malaysia. Primary supplier SUP-001 is impacted. Product: Automotive-grade MCU. Port closed for 72h."}'
```

**Auto-execute run (small disruption → confidence 91)**

```bash
curl -X POST http://localhost:8010/workflow/run \
  -H 'Content-Type: application/json' \
  -d '{"alert_text":"Flood affecting Bandung, Indonesia. Primary supplier SUP-004 is impacted."}'
```

**No-impact run (halts with `halted_no_impact`)**

```bash
curl -X POST http://localhost:8010/workflow/run \
  -H 'Content-Type: application/json' \
  -d '{"alert_text":"Earthquake affecting Hanoi, Vietnam. Primary supplier SUP-008 is impacted."}'
```

**Async run + live stream (what the UI does)**

```bash
# 1) start it
curl -X POST http://localhost:8010/workflow/start \
  -H 'Content-Type: application/json' \
  -d '{"alert_text":"Typhoon affecting Tanjung Pelepas, Malaysia. Primary supplier SUP-001 is impacted."}'
# -> {"thread_id":"run-xxxx","status":"running"}

# 2) stream the agent steps (replace run-xxxx)
curl -N http://localhost:8010/workflow/stream/run-xxxx
```

**Blast radius `$graphLookup` (the impact query, conceptual)**

```javascript
db.orders.aggregate([
  { $match: { status: "active" } },
  { $graphLookup: {
      from: "suppliers",
      startWith: "$depends_on",
      connectFromField: "depends_on",
      connectToField: "_id",
      as: "dependency_chain"
  } },
  { $match: { "dependency_chain._id": affectedSupplierId } },
  { $group: {
      _id: null,
      impacted_orders: { $sum: 1 },
      required_capacity: { $sum: "$quantity_remaining" }
  } }
])
```

---

## 8. Following the audit trail

Every decision is logged. After a run:

- Open the **Audit Logs** screen (left nav) and filter by `thread_id`, or
- Query MongoDB directly:

```javascript
db.audit_logs.find({ thread_id: "run-xxxx" }).sort({ ts: 1 })
```

You will see one entry per agent action — `supervisor.classify`, `impact_assessor.blast_radius`,
`sourcing.vector_search`, `compliance.rag_vet` (PASS/FAIL with reasons), and
`mitigation_planner.compile_plan` (winner, confidence, action).

---

## 9. Troubleshooting

| Symptom | Fix |
|---------|-----|
| **"Cannot reach API at http://localhost:8010"** | The backend isn't running, or you're on a remote browser. Start it (`uvicorn app.main:app --host 0.0.0.0 --port 8010`) and, in Codespaces, use the forwarded `…-8010.app.github.dev` URL. |
| Sourcing returns no candidates / errors | The Atlas vector indexes may still be building. Wait until `supplier_vector_index` and `policy_vector_index` are **READY/queryable**, then retry. |
| Results look generic / repeated | The system may be in `LLM_MODE=mock` (deterministic stubs). For real reasoning set `LLM_MODE=bedrock` with valid AWS credentials. |
| A run halts with `halted_no_impact` | Expected when the chosen **Supplier** has no dependent orders — pick one from the impact table in §6. |

---

*Built on MongoDB Atlas (`$graphLookup`, `$vectorSearch`, Vector RAG) · LangGraph · AWS Bedrock.*
