"""LangGraph state machine wiring all five agents with conditional edges.

Flow:
  supervisor → impact_assessor → [halt if no impact] → sourcing → compliance
  compliance → (vetted? planner : retry<max? sourcing : planner→HITL)
  planner → END
"""
from __future__ import annotations

import argparse
import uuid

from langgraph.graph import END, StateGraph

from app.agents.compliance import compliance
from app.agents.impact_assessor import impact_assessor
from app.agents.mitigation_planner import mitigation_planner
from app.agents.sourcing import sourcing
from app.agents.state import DisruptionState, new_state
from app.agents.supervisor import supervisor_classify
from app.config import settings
from app.mcp_tools import audit


def _after_impact(state: DisruptionState) -> str:
    return "halt" if state.get("status") == "halted_no_impact" else "sourcing"


def _after_compliance(state: DisruptionState) -> str:
    if state.get("vetted_suppliers"):
        return "planner"
    if state.get("compliance_retries", 0) < settings.compliance_max_retries \
            and state.get("candidate_suppliers"):
        # are there still un-evaluated/un-rejected suppliers worth re-sourcing?
        return "retry_sourcing"
    return "planner"  # planner will escalate to HITL when no vetted suppliers


def build_graph():
    g = StateGraph(DisruptionState)
    g.add_node("supervisor", supervisor_classify)
    g.add_node("impact_assessor", impact_assessor)
    g.add_node("sourcing", sourcing)
    g.add_node("compliance", compliance)
    g.add_node("planner", mitigation_planner)

    g.set_entry_point("supervisor")
    g.add_edge("supervisor", "impact_assessor")
    g.add_conditional_edges("impact_assessor", _after_impact,
                            {"halt": END, "sourcing": "sourcing"})
    g.add_edge("sourcing", "compliance")
    g.add_conditional_edges("compliance", _after_compliance,
                            {"planner": "planner", "retry_sourcing": "sourcing"})
    g.add_edge("planner", END)
    return g.compile()


def run_workflow(alert_text: str, thread_id: str | None = None) -> DisruptionState:
    thread_id = thread_id or uuid.uuid4().hex
    state = new_state(thread_id, alert_text)
    audit.log(thread_id, "system", "workflow_start", input_summary=alert_text)
    graph = build_graph()
    # recursion_limit guards against unexpected loops
    final = graph.invoke(state, config={"recursion_limit": 25})
    audit.log(thread_id, "system", "workflow_end",
              output_summary=f"status={final.get('status')} "
                             f"action={final.get('recommended_action')}")
    return final


DEMO_ALERT = (
    "Typhoon Yagi has closed the Port of Tanjung Pelepas (Malaysia) for 72 hours. "
    "Primary supplier SUP-001 (Chang Electronics, Malaysia) has stock but cannot deliver "
    "23 active orders totalling 48,200 units of automotive-grade MCUs and sensor components."
)


def _print_demo(final: DisruptionState) -> None:
    print("\n" + "=" * 70)
    print("RESILIOCHAIN — DEMO RESULT")
    print("=" * 70)
    print(f"severity            : {final.get('severity')}")
    print(f"disrupted supplier  : {final.get('affected_supplier_id')}")
    print(f"impacted orders     : {len(final.get('impacted_orders', []))}")
    print(f"required capacity   : {final.get('required_capacity')}")
    print(f"candidates evaluated: {len(final.get('compliance_results', []))}")
    rejected = [r for r in final.get("compliance_results", []) if not r["passed"]]
    print(f"rejected            : {[r['supplier_id'] for r in rejected]}")
    print(f"vetted              : {[v['supplier_id'] for v in final.get('vetted_suppliers', [])]}")
    brief = final.get("mitigation_brief", {})
    print(f"WINNER              : {brief.get('backup_supplier')} "
          f"({brief.get('backup_supplier_name')})")
    print(f"confidence          : {final.get('confidence_score')}")
    print(f"recommended action  : {final.get('recommended_action')}")
    print(f"status              : {final.get('status')}")
    print("-" * 70)
    print(brief.get("summary", ""))
    print("=" * 70)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--demo", action="store_true", help="run the Typhoon-Yagi demo scenario")
    ap.add_argument("--alert", type=str, default="", help="custom alert text")
    args = ap.parse_args()
    alert = args.alert or DEMO_ALERT
    final = run_workflow(alert, thread_id="demo-" + uuid.uuid4().hex[:8])
    _print_demo(final)
