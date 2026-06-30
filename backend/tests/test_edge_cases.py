"""Edge-case tests: unknown suppliers / no-impact paths.

Mock LLM mode; blast-radius hits the live cluster, workflow runs end-to-end.
"""
import os

os.environ["LLM_MODE"] = "mock"

from app.agents.graph import run_workflow  # noqa: E402
from app.mcp_tools.blast_radius_query import blast_radius_query  # noqa: E402


def test_blast_radius_unknown_supplier_is_empty():
    res = blast_radius_query("SUP-ZZZ-NONEXISTENT")
    assert res["required_capacity"] == 0
    assert res["impacted_orders"] == []
    assert res["affected_skus"] == []


def test_workflow_unknown_supplier_completes_gracefully():
    final = run_workflow(
        "Minor logistics hiccup affecting supplier SUP-ZZZ with no known orders.",
        thread_id="pytest-edge-unknown",
    )
    assert isinstance(final, dict)
    assert final.get("status") in ("halted_no_impact", "complete")
