# instructions.md — Development Rules & Execution Order

## Coding conventions
- **Python:** 3.11+, type hints everywhere, `from __future__ import annotations` at top of modules.
  Snake_case. Pure functions for tools; side effects (DB writes) isolated in `mcp_tools/` and `db/`.
  No bare `except` — catch specific errors and log to `audit_logs`.
- **TypeScript/React:** function components, hooks, Tailwind utility classes. PascalCase components,
  camelCase functions. Co-locate page-specific components; shared ones in `frontend/components/`.
- **Config:** never read `os.environ` outside `config.py`. Never read `process.env` outside
  `frontend/lib/config.ts`. Never hardcode secrets, model IDs, or collection names.

## Naming
- MongoDB collections: `orders`, `suppliers`, `compliance_policies`, `agent_checkpoints`,
  `mitigation_plans`, `audit_logs`, `disruptions` (see `config.Settings`).
- MCP tools (Python fns): `blast_radius_query`, `supplier_vector_search`, `compliance_rag_query`,
  `read_checkpoint`, `write_checkpoint`, `write_plan`, `update_plan_status`.
- Agents: `supervisor`, `impact_assessor`, `sourcing`, `compliance`, `mitigation_planner`.

## Execution order (do not reorder)
0. Bootstrap → 1. Seed data → 2. Atlas indexes/vector search → 3. Agents + e2e (CHECKPOINT)
→ 4. API → 5. UI → 6. Docs → 7. Screenshots → 8. Tests/finalize.

## Per-phase deliverable
Output: phase name · files changed · what was implemented · how to run/test · status · next phase.
Update `PROJECT_STATUS.md` and `COMPLETED_PHASES.md` every phase.

## Hard requirements (from the brief)
- MongoDB is the primary platform; demonstrate `$graphLookup`, `$vectorSearch`, Vector RAG, checkpoints.
- Confidence score = deterministic formula in a tool, NOT LLM output.
- Never recommend a supplier without risk + compliance check.
- Never classify a supplier without an explanation.
- Stock availability ≠ delivery possible (impacted supplier may have stock but blocked route).
- Always write `audit_logs`. Always persist checkpoints. Fail gracefully, never silently.
- Docs: both technical AND non-technical, in `.md` AND `.html`, with clipboard-copy buttons.
- Provider-agnostic LLM layer (Bedrock now, swappable).

## Running locally
- Backend: `cd backend && python -m venv .venv && source .venv/bin/activate &&
  pip install -r requirements.txt && uvicorn app.main:app --reload`
- Seed: `cd backend && python -m app.db.seed`
- Indexes: `cd backend && python -m app.db.indexes`
- Demo e2e: `cd backend && python -m app.agents.graph --demo`
- Frontend: `cd frontend && npm install && npm run dev`
