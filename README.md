# 🛡️ ResilioChain

> Agentic AI for supply-chain disruption response — powered by **MongoDB Atlas** + **LangGraph** + **AWS Bedrock (Claude)**, deployed on **Bedrock AgentCore**.

When a typhoon closes a port, a war disrupts a region, or sanctions block a supplier,
**ResilioChain** ingests the disruption alert and runs a **5-agent LangGraph workflow** that:

1. **Classifies** the disruption severity and scope (Supervisor).
2. **Computes the blast radius** — impacted orders/SKUs/suppliers — via MongoDB `$graphLookup` over an order→supplier dependency graph (Impact Assessor).
3. **Sources alternatives** — semantic supplier match with `$vectorSearch`, hard-filtered by capacity, excluding the disrupted region (Sourcing).
4. **Vets compliance** — Vector **RAG** over ESG / sanctions / labour policies; loops back to sourcing on failure (≤3 retries) (Compliance).
5. **Compiles a mitigation brief** with a **deterministic** confidence score and an auto-execute / human-review decision (Mitigation Planner).

Every decision is checkpointed (thread memory) and written to an immutable audit trail.

---

## Demo scenario
> **Typhoon Yagi** closes the Port of Tanjung Pelepas (Malaysia) for 72h. Primary supplier **SUP-001**
> can't fulfil **23 orders / 48,200 units** of automotive-grade MCUs. ResilioChain **rejects SUP-FAIL**
> (Vietnam, ESG 22) on compliance and recommends **SUP-002 (PT Maju Jaya, Indonesia)** — confidence
> **75 → HUMAN_REVIEW**, +8% cost, reroute via Singapore.

---

## Architecture
See [ARCHITECTURE.md](ARCHITECTURE.md) · [AGENTS.md](AGENTS.md) · [MONGODB_SCHEMA.md](MONGODB_SCHEMA.md).

```
External Trigger ──► LangGraph Orchestration (5 agents) ──► MongoDB Atlas (the core) ──► AWS Bedrock
                          │  Supervisor → Impact → Sourcing → Compliance → Planner          (Claude)
                          └─ guardrail gate · HITL · ≤3 compliance retries
Observability: LangSmith (traces) · audit_logs (state) · CloudWatch (AgentCore runtime)
Deployment:    AWS Bedrock AgentCore Runtime (ARM64 container) · MCP server (tools)
```

| Layer | Tech |
|---|---|
| UI | Next.js 14, React, Tailwind, Framer Motion (11 pages) |
| Orchestration | LangGraph multi-agent state machine (Python) |
| Backend/API | FastAPI (REST + SSE streaming) |
| Data & AI retrieval | MongoDB Atlas — `$graphLookup`, `$vectorSearch`, Vector RAG, autoEmbed, checkpoints |
| LLM | AWS Bedrock — Claude Haiku 4.5 (provider-abstracted, mock fallback) |
| Tool protocol | Real **MCP server** (FastMCP) with automatic Python fallback |
| Deployment | **Bedrock AgentCore Runtime** (live) |
| Observability | LangSmith tracing · MongoDB audit trail · CloudWatch |

---

## Feature coverage

### MongoDB AI features (all verified on the live cluster)
| Feature | Status | Where |
|---|---|---|
| `$vectorSearch` — semantic supplier match | ✅ | `mcp_tools/supplier_vector_search.py` |
| `$vectorSearch` as **RAG** — compliance policies | ✅ | `mcp_tools/compliance_rag_query.py` |
| `$graphLookup` — blast-radius dependency graph | ✅ | `mcp_tools/blast_radius_query.py` |
| Atlas Vector Search indexes (with filters) | ✅ | `db/indexes.py` (`supplier_vector_index`, `policy_vector_index`) |
| **Automated Embedding (autoEmbed)** — Atlas-managed | ✅ | Voyage `voyage-4`, no manual vectors |
| **Voyage AI** embedding provider | ✅ | wired into both vector indexes |
| Checkpointing / thread memory | ✅ | `agent_checkpoints` (M4) |
| Polymorphic documents | ✅ | `orders.bom` — 6 distinct shapes by SKU family |
| Zero-ETL (operational + vectors in one collection) | ✅ | architectural — no separate vector DB |
| **GraphRAG** (canonical, MongoDBGraphStore-style) | ✅ | `/graphrag` — entity extraction → multi-hop `$graphLookup` → grounded answer |

### Agentic architecture
| Capability | Status |
|---|---|
| 5 LangGraph agents (Supervisor, Impact, Sourcing, Compliance, Planner) | ✅ verified end-to-end |
| Conditional edges + Compliance↔Sourcing retry (≤3) | ✅ |
| **Compliance/safety guardrail** before mitigation | ✅ non-compliant supplier can never win |
| **HITL** gate + escalation (deterministic threshold) | ✅ |
| Deterministic confidence score (tool-computed, not LLM) | ✅ |
| Real **MCP server** (FastMCP) + Python fallback | ✅ both paths verified |
| **AWS Bedrock AgentCore** deployment | ✅ live, invoked from the cloud |

### Observability & quality
| Capability | Status |
|---|---|
| **LangSmith** tracing | ✅ live (AWS-hosted endpoint) |
| **State Auditability** (`audit_logs`) | ✅ every decision logged |
| CloudWatch (AgentCore runtime) | ✅ |
| **AI Evaluation layer** (MongoDB-native) | ✅ `/evaluation` — dataset + 8 evaluators, 100% pass |
| Test suite (pytest) | ✅ 23/23 |

---

## The app — 11 pages
| Page | What it shows |
|---|---|
| **Dashboard** | KPIs, platform health, recent disruptions |
| **Disruption Intake** | Report a disruption → starts the workflow |
| **Supplier Impact** | Classifies suppliers (Impacted / Good / Risky / Compliance-Blocked) with reasons |
| **Alternative Sourcing** | `$vectorSearch` candidates, ranked |
| **Agent Workflow** | Live animated 5-agent DAG + SSE step stream |
| **Mitigation Brief** | Winner, confidence gauge, cost variance, AUTO/HITL, rejected suppliers |
| **MongoDB Explorer** | Browse collections + the real `$graphLookup`/`$vectorSearch` pipelines |
| **Audit Logs** | Filterable decision trail (state auditability) |
| **Observability** | Live LangSmith traces + audit metrics ("Open in LangSmith ↗") |
| **GraphRAG** | Canonical GraphRAG: extract → multi-hop traverse → grounded answer |
| **Evaluation** | MongoDB-native eval: pass-rate, per-evaluator scores, per-case results |

---

## Quick start
```bash
# 1. Configure
cp .env.example .env          # fill in MongoDB URI + AWS Bedrock creds (+ optional LangSmith)

# 2. Backend  (Python 3.9+; 3.11+ recommended)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m app.db.seed             # load demo dataset into Atlas
python -m app.db.indexes --wait   # create vector + graph indexes (autoEmbed)
python -m app.agents.graph --demo # run the Typhoon-Yagi scenario end-to-end
uvicorn app.main:app --port 8010  # serve the API on :8010   (8000 may be taken)

# 3. Frontend
cd ../frontend
npm install
NEXT_PUBLIC_API_BASE=http://localhost:8010 npm run dev   # http://localhost:3000
```

**URLs:** App → http://localhost:3000 · API → http://localhost:8010 · API docs → http://localhost:8010/docs

### Run modes
- `LLM_MODE=bedrock` (default) — real Claude on Bedrock · `LLM_MODE=mock` — deterministic, no creds.
- Optional **MCP server** (protocol-accurate tools; app falls back to Python if absent):
  `cd backend && ../.agentcore-venv/bin/python -m app.mcp_server`

### Tests
```bash
cd backend && source .venv/bin/activate && LLM_MODE=mock pytest -q   # 23 passed
```

---

## AWS Bedrock AgentCore (deployed)
The agent is live on AgentCore Runtime:
`arn:aws:bedrock-agentcore:us-east-1:…:runtime/resiliochain-…`
```bash
source .agentcore-venv/bin/activate
agentcore status
agentcore invoke '{"alert_text":"<your disruption>"}'   # returns the SUP-002 decision from the cloud
```
Cost: per-second runtime compute during invocation (~$0 idle) + ECR + Bedrock tokens.

---

## Documentation
- 🧑‍💻 Technical: [docs/technical.md](docs/technical.md) · [docs/technical.html](docs/technical.html)
- 🧒 Non-technical (ELI10): [docs/non-technical.md](docs/non-technical.md) · [docs/non-technical.html](docs/non-technical.html)
- ✨ Animated showcase: [docs/showcase.html](docs/showcase.html)
- 📋 Status: [PROJECT_STATUS.md](PROJECT_STATUS.md) · [COMPLETED_PHASES.md](COMPLETED_PHASES.md)
- 📐 Specs: [API_SPEC.md](API_SPEC.md) · [UI_SPEC.md](UI_SPEC.md) · [TESTING.md](TESTING.md) · [DEPLOYMENT.md](DEPLOYMENT.md)
- 🤖 Resume guide for AI agents: [CLAUDE.md](CLAUDE.md)

---

## Repo layout
```
backend/   FastAPI + LangGraph + MongoDB + Bedrock + MCP server + GraphRAG + evaluation
  app/agents/    5 agents + graph + deterministic confidence
  app/mcp_tools/ graph / vector / RAG / checkpoints / plans / audit
  app/api/       health · disruptions · workflow(SSE) · data · observability · graphrag · evaluation
  app/{graphrag,evaluation,mcp_server,mcp_client}.py · agentcore_app.py (AgentCore entrypoint)
frontend/  Next.js 14 — 11 pages, design system, animated agent graph
docs/      technical + non-technical (md & html) · showcase.html · screenshots/
```

---

## Deferred / future
- **AWS Bedrock Guardrails** (managed PII/content filter on LLM calls) — designed, on hold.
- Per-agent Sonnet tiering (Supervisor/Planner) — config-driven, set a Sonnet model ID to enable.
- LLM-as-judge evaluator — optional addition to the evaluation layer.

⚠️ **Security:** All credentials live only in gitignored `.env`. **Rotate any credentials shared during development** (MongoDB, AWS, LangSmith) after the event.
