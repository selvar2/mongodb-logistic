"""DisruptionState — the shared dict threaded through every LangGraph node."""
from __future__ import annotations

from typing import Any, Optional, TypedDict


class DisruptionState(TypedDict, total=False):
    # identity
    thread_id: str
    alert_text: str

    # Supervisor (pass 1)
    severity: str                      # LOW | MEDIUM | HIGH | CRITICAL
    affected_region: str
    affected_supplier_id: str
    affected_route: dict[str, Any]

    # Impact Assessor
    affected_skus: list[str]
    impacted_orders: list[dict[str, Any]]
    required_capacity: int

    # Sourcing
    candidate_suppliers: list[dict[str, Any]]
    sourcing_query: str

    # Compliance
    compliance_results: list[dict[str, Any]]
    vetted_suppliers: list[dict[str, Any]]
    compliance_retries: int
    rejected_supplier_ids: list[str]

    # Mitigation Planner (Supervisor pass 2)
    mitigation_brief: dict[str, Any]
    confidence_score: int
    recommended_action: str            # AUTO_EXECUTE | HUMAN_REVIEW

    # control
    status: str                        # running | complete | halted_no_impact | escalated_hitl
    error: Optional[str]


def new_state(thread_id: str, alert_text: str) -> DisruptionState:
    return DisruptionState(
        thread_id=thread_id,
        alert_text=alert_text,
        compliance_retries=0,
        rejected_supplier_ids=[],
        candidate_suppliers=[],
        compliance_results=[],
        vetted_suppliers=[],
        status="running",
        error=None,
    )
