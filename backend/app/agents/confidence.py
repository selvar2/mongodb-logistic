"""Deterministic confidence scoring — NOT produced by the LLM.

Vector similarity from autoEmbed is a weak signal for short supplier texts (scores
cluster near 0.5), so it is used only for candidate RECALL in sourcing, not for the
final score. Confidence is a transparent weighted blend of real business signals:

  confidence (0-100) =
      0.35 * esg_component        (esg_score / 100)
    + 0.30 * cost_component       (1 - clamp(|cost_variance_pct| / 40))
    + 0.15 * capacity_component   (clamp((capacity - required) / required, 0, 1))
    + 0.10 * leadtime_component   (1 - clamp(lead_time_days / 60))
    + 0.10 * compliance_component (1.0 if all compliance dimensions PASS else 0.0)

recommended_action:
  AUTO_EXECUTE if confidence >= CONFIDENCE_AUTO_THRESHOLD (default 85) AND esg_score >= 60,
  else HUMAN_REVIEW.  (HITL is mandatory below the threshold or when ESG is weak.)
"""
from __future__ import annotations

from app.config import settings

W_ESG, W_COST, W_CAP, W_LEAD, W_COMP = 0.35, 0.30, 0.15, 0.10, 0.10


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def compute_confidence(*, esg_score: float, cost_variance_pct: float,
                       capacity_units_month: float, required_capacity: float,
                       lead_time_days: float, compliance_passed: bool) -> int:
    esg_c = _clamp(esg_score / 100.0)
    cost_c = _clamp(1.0 - abs(cost_variance_pct) / 40.0)
    headroom = ((capacity_units_month - required_capacity) / required_capacity
                if required_capacity else 0.0)
    cap_c = _clamp(headroom)
    lead_c = _clamp(1.0 - lead_time_days / 60.0)
    comp_c = 1.0 if compliance_passed else 0.0
    score = 100.0 * (W_ESG * esg_c + W_COST * cost_c + W_CAP * cap_c
                     + W_LEAD * lead_c + W_COMP * comp_c)
    return int(round(score))


def decide_action(confidence: int, esg_score: float) -> str:
    if confidence >= settings.confidence_auto_threshold and esg_score >= 60:
        return "AUTO_EXECUTE"
    return "HUMAN_REVIEW"
