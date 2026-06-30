# PROJECT_STATUS.md

_Last updated: 2026-06-30 — 🎉 ALL 8 PHASES COMPLETE_

## Current phase
**DONE + DEPLOYED.** Full-stack ResilioChain built & verified end-to-end on live Atlas + Bedrock,
**and the agent is deployed live on AWS Bedrock AgentCore Runtime** (ARN
`...:runtime/resiliochain-ktwhsXCm1M`), verified by a real cloud invocation returning the SUP-002
decision. Backend (FastAPI + LangGraph + MongoDB) + Frontend (Next.js UI) + docs + tests + AgentCore.

## How to run
- Backend: `cd backend && source .venv/bin/activate && uvicorn app.main:app --port 8010`
  (seed/index already loaded; `LLM_MODE=mock` for offline demo, else real Bedrock).
- Frontend: `cd frontend && NEXT_PUBLIC_API_BASE=http://localhost:8010 npm run dev` → :3000.
- Demo: open /workflow → "Run Demo Workflow" (live agent stream) or /brief → generate.

## Verification (all PASS)
- Backend: **23/23 pytest** green. Frontend: `npm run build` green (12 routes).
- API live, MongoDB connected, real Bedrock classification verified, SSE streaming works.
- Demo faithful: SUP-FAIL rejected on ESG, **SUP-002 wins** (conf 75 → HUMAN_REVIEW).
- 9 UI pages, 7 shared components, 4 docs (md+html w/ copy buttons), 11 screenshots.
- Skills used: ui-ux-pro-max (design system), obra/superpowers (TDD + parallel-agents). Agent
  teams: Frontend Squad (4), Docs Squad (2), QA Squad (1) — all native subagents, disjoint files.
- Observability (2026-06-30): **LangSmith tracing LIVE** (AWS-hosted endpoint
  `aws.api.smith.langchain.com`, project `resiliochain`) + **State Auditability** (audit_logs 270+
  docs, checkpoints) + CloudWatch (AgentCore runtime). All three observability items now real.
- Additional skills installed (2026-06-30): `patricio0312rev/skills@framer-motion-animator`
  (7.1K, Low) and the official `21st-dev/registry@21st-registry`. framer-motion npm already present.
- More skills (2026-06-30): leonxlnx/taste-skill (13 design skills), pbakaus/impeccable (UI/UX,
  175.7K), snarktank/ralph (ralph+prd), heygen-com/hyperframes (video suite).
  npm added to frontend: @react-spring/web 10.1.2, gsap 3.15.0, motion 12.42.0.
- ⚠️ Security: removed 3 flagged hyperframes skills — `media-use` (Critical), `music-to-video`
  (High), `embedded-captions` (2 alerts). `multica-ai/karapathy-skills` skipped (repo missing).
  NOTE: these design/video skills are auxiliary tooling, not part of the ResilioChain app itself.

## Completed work
- ✅ **Phase 0** — structure, config (`.env`, config.py, mongo.py), all governance docs, deps
  installed in `backend/.venv`, Atlas ping OK, find-skills discovery recorded.
- ✅ **Phase 1** — `seed.py`: 15 suppliers / 30 orders / 32 policy chunks; SUP-001 = 23 impacted
  orders / 48,200 units; demo actors (SUP-002 winner, SUP-FAIL Vietnam esg=22).
- ✅ **Phase 2** — `indexes.py`: graphLookup indexes + Atlas autoEmbed vector indexes
  (`supplier_vector_index`, `policy_vector_index`, Voyage `voyage-4`), both queryable & verified.
- ✅ **Phase 3** — 7 MCP tools, Bedrock provider (+mock), 5 LangGraph agents, deterministic
  confidence, conditional edges. Demo verified on real Bedrock + Atlas; **13/13 pytest pass**.

## Pending work (Phases 4–8 — awaiting go-ahead)
- Phase 4: FastAPI backend — REST endpoints + SSE workflow streaming (see API_SPEC.md).
- Phase 5: Next.js enterprise UI (9 pages, Framer Motion animated agent graph).
- Phase 6: technical + non-technical docs (.md + .html with clipboard buttons).
- Phase 7: screenshots. Phase 8: full test suite + finalize.

## Blockers
- ✅ **RESOLVED — Voyage AI rate limit lifted.** Payment method (Visa …8006) added to "Senthil's
  Org" on 2026-06-29; verified functionally (6 vector queries in 3.8s, 0× 429) and visually on the
  Atlas billing page. Month-to-date usage $0.00 (free 200M embedding tokens still apply). Backoff +
  single-shared-RAG mitigations remain in place as belt-and-suspenders.
- None outstanding.

## Next recommended task
Get go-ahead, then start **Phase 4** (FastAPI). The graph entrypoint `app.agents.graph.run_workflow`
is ready to wrap in an endpoint; stream per-node progress via the checkpoints/audit writes.

## Skills discovered (find-skills)
Ran `npx skills find` for langgraph, fastapi, mongodb vector search, next.js, python testing.
| Query | Top result | Decision |
|---|---|---|
| mongodb vector search | `mongodb/agent-skills@mongodb-search-and-ai` (1.9K, official) | **USE** — already available in session; applied to Phase 2 index/vector work |
| fastapi backend | `eng0ai/eng0-template-skills@fastapi-backend-template` (192) | reference only |
| langgraph multi-agent | `langchain-ai/skills-benchmarks@framework-selection` (43) | low install — skip |
| next.js frontend | `borghei/claude-skills@senior-frontend` (259) | reference for Phase 5 |
| python testing | `mindrally/skills@python-testing` (662) | reference for Phase 8 |

**Policy:** only the official MongoDB skill is used directly (security: avoid installing
low-reputation third-party skills with full agent permissions). Built-in MongoDB skills
(`mongodb-schema-design`, `mongodb-search-and-ai`) cover our needs.

## Credentials note
⚠️ Live MongoDB + AWS keys were provided in chat and stored in `.env` only. **Rotate after the event.**

---

# 📌 Consolidated Status — all deliverables (updated 2026-06-30)

## Core (Phases 0–8) — ✅ COMPLETE & VERIFIED
Full-stack ResilioChain on live MongoDB Atlas + AWS Bedrock: 5-agent LangGraph workflow,
FastAPI (REST + SSE), Next.js enterprise UI, technical + non-technical docs, screenshots.
Demo verified: SUP-001 disrupted → 23 orders / 48,200 units → SUP-FAIL+SUP-008 rejected (ESG)
→ **SUP-002 wins**, confidence 75 → HUMAN_REVIEW. **23/23 pytest green.**

## Post-build additions — ✅ ALL COMPLETE & VERIFIED
| # | Addition | Result |
|---|---|---|
| 1 | **AWS Bedrock AgentCore** deployment | LIVE — ARN `…/runtime/resiliochain-ktwhsXCm1M`; cloud invocation returns SUP-002 |
| 2 | **Real MCP server** (FastMCP) + Python fallback | both paths verified (`transport=mcp` / `fallback`) |
| 3 | **/observability** page | live LangSmith traces + MongoDB audit, "Open in LangSmith ↗" (exact project URL) |
| 4 | **LangSmith** tracing | LIVE (AWS-hosted endpoint `aws.api.smith.langchain.com`, project `resiliochain`) |
| 5 | **Canonical GraphRAG** (/graphrag) | extract → multi-hop `$graphLookup` (hop 2) → grounded answer |
| 6 | **Polymorphic documents** | `orders.bom` → 6 distinct shapes by SKU family |
| 7 | **MongoDB-native AI Evaluation** (/evaluation) | 5-case dataset + 8 evaluators → 100% pass; results in `eval_runs` |
| 8 | Animated **showcase.html** | standalone GSAP page (existing docs untouched) |
| 9 | README full coverage refresh | done |

## Feature-by-feature verification (all tested live)
- MongoDB AI: `$vectorSearch` ✅ · Vector RAG ✅ · `$graphLookup` ✅ · Atlas vectorSearch indexes+filters ✅
  · autoEmbed (Voyage voyage-4) ✅ · checkpoints/thread memory ✅ · polymorphic docs ✅ · Zero-ETL ✅ · GraphRAG ✅
- Agentic: 5 agents ✅ · retry loop ✅ · compliance guardrail ✅ · HITL gate+escalation ✅ · deterministic confidence ✅
- Observability: LangSmith ✅ · State Auditability ✅ · CloudWatch ✅ · AI Evaluation ✅
- Tooling: real MCP server + fallback ✅ · AgentCore deploy ✅

## UI — 11 pages
dashboard · intake · classification · sourcing · workflow (live SSE) · brief · data-explorer ·
audit · observability · graphrag · evaluation. `npm run build` green.

## Collections in `resiliochain`
orders · suppliers · compliance_policies · agent_checkpoints · mitigation_plans · audit_logs ·
disruptions · knowledge_graph (GraphRAG) · eval_dataset · eval_runs.

## How to run
- Backend: `cd backend && source .venv/bin/activate && uvicorn app.main:app --port 8010`
- Frontend: `cd frontend && NEXT_PUBLIC_API_BASE=http://localhost:8010 npm run dev` → :3000
- MCP server (optional): `../.agentcore-venv/bin/python -m app.mcp_server`
- AgentCore: `source .agentcore-venv/bin/activate && agentcore invoke '{"alert_text":"…"}'`
- Tests: `LLM_MODE=mock pytest -q` (23 passed)

## Deferred (revisit later)
- AWS Bedrock **Guardrails** (managed PII/content filter) — designed, on hold per user.
- Per-agent **Sonnet** tiering (Supervisor/Planner) — config-driven, add a Sonnet model ID.
- **LLM-as-judge** evaluator — optional add to /evaluation.

## ⚠️ Security
All secrets in gitignored `.env`. **Rotate after the event:** MongoDB password, AWS access key,
LangSmith API key (all were shared in chat / passed to AgentCore build).

## Two environment notes (for Codespaces / portability)
- Backend runtime is **Python 3.9** (mcp SDK needs ≥3.10 → MCP server runs in the 3.14
  `.agentcore-venv`). In **Codespaces (3.11+)** you can use a single venv for everything.
- API runs on **:8010** (8000 occupied locally); set `NEXT_PUBLIC_API_BASE` accordingly.
