# TESTING.md — ResilioChain

> Finalized in **Phase 8**. Strategy below; tests live in `backend/tests/`.

## Test layers
1. **Connectivity** — `test_mongo.py`: ping cluster, db reachable.
2. **MCP tools** — one test per tool:
   - `blast_radius_query` returns ~23 impacted orders for SUP-001.
   - `supplier_vector_search` returns capacity-filtered ranked suppliers (SUP-002 present).
   - `compliance_rag_query` retrieves Vietnam-risk chunks for a Vietnam supplier.
   - `read/write_checkpoint`, `write_plan/update_plan_status` round-trip.
3. **Confidence** — `test_confidence.py`: deterministic formula, threshold + ESG override.
4. **Agent graph** — `test_graph.py`: runs the full LangGraph on the demo scenario in `LLM_MODE=mock`.
5. **End-to-end** — `test_e2e_demo.py`: SUP-FAIL rejected (ESG), SUP-002 wins, plan + audit written.
6. **API** — `test_api.py` (httpx): health, intake, workflow run, audit endpoints.

## Running
```bash
cd backend && source .venv/bin/activate
LLM_MODE=mock pytest -q            # fast, no Bedrock calls
pytest -q                          # full, hits Bedrock + Atlas
```

## Edge cases to cover
Missing/duplicate suppliers, zero inventory, all-candidates-blocked (HITL escalation), invalid
region, LLM failure (mock raises), Atlas timeout, empty blast radius.
