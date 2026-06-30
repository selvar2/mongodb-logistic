# UI_SPEC.md — ResilioChain Frontend (Next.js)

> Finalized in **Phase 5**. Enterprise-grade, animated (Framer Motion), responsive.

## Design language
- **Palette:** deep slate/navy base, electric-teal + amber accents, status colors
  (green=good, amber=risky, red=impacted/blocked, grey=neutral).
- **Motion:** animated agent-workflow graph (nodes light up as each agent runs), timeline
  reveal, status-card count-ups, smooth page transitions. Tasteful, not noisy.
- **Dual audience:** plain-language summaries on top, "technical details" expanders beneath.

## Pages
1. **Dashboard** — KPIs (active disruptions, impacted orders, units at risk, avg confidence),
   recent disruptions, live workflow status.
2. **Disruption Intake** — form (event type, region, product, supplier, issue) → triggers workflow.
3. **Supplier Impact Classification** — table of suppliers tagged IMPACTED / GOOD / ALTERNATIVE /
   RISKY / COMPLIANCE-BLOCKED, each with a why.
4. **Alternative Supplier Search** — ranked vector-search candidates with similarity, capacity, ESG.
5. **Agent Workflow Status** — animated LangGraph DAG; per-node state, inputs/outputs, retries.
6. **Mitigation Brief** — final recommendation, cost variance, confidence gauge, AUTO/HITL badge.
7. **MongoDB Data Explorer** — browse orders/suppliers/policies; shows the actual `$graphLookup` /
   `$vectorSearch` pipelines used (copyable).
8. **Audit Logs** — filterable decision trail.
9. **Documentation Viewer** — renders technical + non-technical docs with copy buttons.

## Shared components
`StatusCard`, `AgentGraph` (animated), `Timeline`, `ConfidenceGauge`, `SupplierBadge`,
`CopyButton`, `PipelineViewer`, `Nav`.
