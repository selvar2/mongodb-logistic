"""Unit tests for the deterministic compliance rule (no DB/LLM)."""
from app.agents.compliance import _evaluate

CHUNKS = [{
    "source_doc": "esg-policy-2024.pdf",
    "policy_type": "ESG",
    "text": "Vietnam region suppliers are flagged for labour risk and excluded "
            "absent ISO-14001 certification.",
}]


def test_vietnam_low_esg_fails():
    cand = {"supplier_id": "SUP-VN", "name": "Hanoi Components",
            "geo_region": "Vietnam", "esg_score": 22, "certifications": []}
    res = _evaluate(cand, CHUNKS)
    assert res["passed"] is False
    assert res["esg_status"] == "FAIL"
    assert res["fail_reasons"]


def test_indonesia_high_esg_with_iso_passes():
    cand = {"supplier_id": "SUP-ID", "name": "Jakarta Semi",
            "geo_region": "Indonesia", "esg_score": 88,
            "certifications": ["ISO-14001"]}
    res = _evaluate(cand, CHUNKS)
    assert res["passed"] is True
    assert res["esg_status"] == "PASS"


def test_low_esg_anywhere_fails():
    cand = {"supplier_id": "SUP-LO", "name": "Generic Co",
            "geo_region": "Thailand", "esg_score": 35, "certifications": []}
    res = _evaluate(cand, CHUNKS)
    assert res["esg_status"] == "FAIL"
    assert res["passed"] is False
