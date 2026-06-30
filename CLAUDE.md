# CLAUDE.md — AI Agent Continuation Guide

> Read this first if you are an AI coding agent resuming work on ResilioChain.

## What this project is
**ResilioChain** is an enterprise agentic AI app for the MongoDB Agentic AI Hackathon. It
ingests a supply-chain disruption alert and runs a **LangGraph multi-agent state machine** on
**MongoDB Atlas** + **AWS Bedrock (Claude)** to produce a ranked mitigation brief.

## Stack (already decided — do not change without asking)
- **Backend:** Python 3.11+, FastAPI, LangGraph, PyMongo, boto3 (Bedrock). Root: `backend/`.
- **Frontend:** Next.js 14 (App Router), React, Tailwind, Framer Motion. Root: `frontend/`.
- **DB:** MongoDB Atlas, database `resiliochain` (live cluster — see `.env`).
- **LLM:** AWS Bedrock, Claude Haiku 4.5. Provider abstraction in `backend/app/llm/bedrock.py`
  with a `mock` mode (set `LLM_MODE=mock`) so the graph runs without credentials.

## How to resume
1. Read **PROJECT_STATUS.md** — current phase, what's done, what's next, blockers.
2. Read **COMPLETED_PHASES.md** — detailed record of each finished phase.
3. Read the approved plan: `~/.claude/plans/nested-wishing-manatee.md` (8-phase build).
4. Continue from the "Next recommended task" in PROJECT_STATUS.md.

## Execution model
Build **backbone first** (Phases 0–3), verify the demo scenario end-to-end, then STOP and report
before Phases 4–8 (API, UI, docs, screenshots, tests).

## Golden rules
- MongoDB is the primary focus: `$graphLookup` (blast radius), `$vectorSearch` (sourcing),
  Vector **RAG** (compliance), checkpoints (M4).
- Confidence score is **deterministic / tool-computed**, never LLM-generated.
- Every agent: structured JSON in/out, writes decisions to `audit_logs`, fails gracefully.
- Never commit `.env`. Never hardcode one LLM vendor — go through the provider abstraction.
- After each phase, update PROJECT_STATUS.md + COMPLETED_PHASES.md (and this file if resume steps change).

## Demo scenario (the canonical test)
Typhoon Yagi closes Port of Tanjung Pelepas 72h. SUP-001 (Chang Electronics, Malaysia) can't
fulfil 23 orders / 48,200 units. SUP-FAIL (Vietnam, esg_score=22) must be **rejected on ESG**.
SUP-002 (PT Maju Jaya, Indonesia) must **win**. Plan written to `mitigation_plans`, trail in
`audit_logs`.

## Key files
- `backend/app/config.py` — all env/config + collection & index names.
- `backend/app/db/{mongo,seed,indexes}.py` — data layer.
- `backend/app/mcp_tools/*` — the 7 MCP tools (graph/vector/RAG/checkpoint/plan/audit).
- `backend/app/agents/*` — DisruptionState + 5 agents + graph wiring + confidence formula.
