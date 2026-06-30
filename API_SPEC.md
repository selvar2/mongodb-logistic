# API_SPEC.md — ResilioChain Backend (FastAPI)

> Detailed payloads are finalized in **Phase 4**. This is the contract the UI builds against.

Base URL: `http://localhost:8010`  (8000 was occupied by another local service)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness + MongoDB ping + LLM mode |
| POST | `/disruptions` | Create a disruption alert (intake) → returns `disruption_id` |
| GET | `/disruptions` | List disruption alerts |
| GET | `/disruptions/{id}` | Get one disruption + its latest workflow result |
| POST | `/workflow/run` | Run the LangGraph workflow for a disruption (returns final state) |
| GET | `/workflow/stream/{thread_id}` | **SSE** stream of agent steps as they execute |
| GET | `/suppliers/classify` | Supplier impact classification view data |
| GET | `/audit-logs` | Audit trail (filter by `thread_id`) |
| GET | `/checkpoints/{thread_id}` | Checkpoint history for a workflow thread |
| GET | `/plans/{thread_id}` | Mitigation plan(s) for a thread |

### Example — intake payload
```json
{ "eventType": "Typhoon", "region": "Tanjung Pelepas, Malaysia",
  "product": "Automotive-grade MCU", "supplier": "SUP-001",
  "issue": "Port closed 72h — supplier has stock but cannot deliver" }
```

### Example — classification output
```json
{ "supplier": "SUP-001", "classification": "IMPACTED_SUPPLIER",
  "reason": "Has inventory but delivery route blocked by port closure.",
  "nextAction": "Search for alternative suppliers outside the affected region." }
```

All responses are clean JSON. Errors: `{ "error": { "code", "message" } }` with proper HTTP status.
