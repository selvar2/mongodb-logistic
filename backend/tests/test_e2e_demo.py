"""End-to-end test of the LangGraph workflow on the Typhoon-Yagi demo scenario.

Runs in mock LLM mode (deterministic, no Bedrock dependency) but hits the live
Atlas cluster for $graphLookup / $vectorSearch / RAG.
"""
import os

import pytest

# force deterministic LLM before importing the graph/config-consuming modules
os.environ["LLM_MODE"] = "mock"

from app.agents.graph import DEMO_ALERT, run_workflow  # noqa: E402


@pytest.fixture(scope="module")
def final_state():
    return run_workflow(DEMO_ALERT, thread_id="pytest-e2e")


def test_blast_radius(final_state):
    assert final_state["affected_supplier_id"] == "SUP-001"
    assert len(final_state["impacted_orders"]) == 23
    assert final_state["required_capacity"] == 48200


def test_esg_failing_supplier_rejected(final_state):
    rejected = {r["supplier_id"] for r in final_state["compliance_results"]
                if not r["passed"]}
    assert "SUP-FAIL" in rejected
    fail = next(r for r in final_state["compliance_results"]
                if r["supplier_id"] == "SUP-FAIL")
    assert fail["esg_status"] == "FAIL"


def test_winner_is_compliant_indonesian_supplier(final_state):
    brief = final_state["mitigation_brief"]
    assert brief["backup_supplier"] == "SUP-002"
    winner = next(o for o in brief["options"] if o["supplier_id"] == "SUP-002")
    assert winner["geo_region"] == "Indonesia"
    assert winner["esg_score"] >= 60


def test_no_supplier_in_disrupted_region(final_state):
    for v in final_state["vetted_suppliers"]:
        assert v["geo_region"] != "Malaysia"


def test_workflow_completed_with_action(final_state):
    assert final_state["status"] == "complete"
    assert final_state["recommended_action"] in ("AUTO_EXECUTE", "HUMAN_REVIEW")
    assert 0 <= final_state["confidence_score"] <= 100
