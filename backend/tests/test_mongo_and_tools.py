"""Integration tests: Atlas connectivity + the graph/blast-radius MCP tool.

These hit the live cluster. Vector-search tools are covered by the e2e test
(kept separate to respect Voyage free-tier rate limits).
"""
import pytest

from app.config import settings
from app.db.mongo import col, ping
from app.mcp_tools.blast_radius_query import blast_radius_query


def test_ping():
    assert ping() is True


def test_seed_counts_present():
    assert col(settings.COL_SUPPLIERS).count_documents({}) >= 15
    assert col(settings.COL_ORDERS).count_documents({}) >= 30
    assert col(settings.COL_POLICIES).count_documents({}) >= 30


def test_blast_radius_for_disrupted_supplier():
    res = blast_radius_query("SUP-001")
    assert len(res["impacted_orders"]) == 23
    assert res["required_capacity"] == 48200
    assert "MCU-32X" in res["affected_skus"]


def test_blast_radius_empty_for_unknown_supplier():
    res = blast_radius_query("SUP-DOES-NOT-EXIST")
    assert res["impacted_orders"] == []
    assert res["required_capacity"] == 0
