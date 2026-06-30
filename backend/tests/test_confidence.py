"""Unit tests for the deterministic confidence formula (no DB/LLM)."""
from app.agents.confidence import compute_confidence, decide_action


def test_strong_supplier_scores_higher_than_weak():
    strong = compute_confidence(esg_score=88, cost_variance_pct=8,
                                capacity_units_month=60000, required_capacity=48200,
                                lead_time_days=21, compliance_passed=True)
    weak = compute_confidence(esg_score=70, cost_variance_pct=25,
                              capacity_units_month=49000, required_capacity=48200,
                              lead_time_days=45, compliance_passed=True)
    assert strong > weak
    assert 0 <= strong <= 100


def test_compliance_fail_drops_score():
    passing = compute_confidence(esg_score=88, cost_variance_pct=8,
                                 capacity_units_month=60000, required_capacity=48200,
                                 lead_time_days=21, compliance_passed=True)
    failing = compute_confidence(esg_score=88, cost_variance_pct=8,
                                 capacity_units_month=60000, required_capacity=48200,
                                 lead_time_days=21, compliance_passed=False)
    assert failing < passing


def test_decision_thresholds():
    assert decide_action(90, esg_score=88) == "AUTO_EXECUTE"
    assert decide_action(75, esg_score=88) == "HUMAN_REVIEW"      # below threshold
    assert decide_action(90, esg_score=40) == "HUMAN_REVIEW"      # weak ESG override


def test_determinism():
    args = dict(esg_score=88, cost_variance_pct=8, capacity_units_month=60000,
                required_capacity=48200, lead_time_days=21, compliance_passed=True)
    assert compute_confidence(**args) == compute_confidence(**args)
