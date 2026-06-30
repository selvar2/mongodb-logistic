"""API tests via FastAPI TestClient.

Mock LLM mode (deterministic) but hits the live Atlas cluster for reads and
the LangGraph workflow run.
"""
import os

# force deterministic LLM before importing app.main (which pulls in agents/config)
os.environ["LLM_MODE"] = "mock"

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok():
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert "status" in body
    assert body["status"] in ("ok", "degraded")


def test_suppliers_count():
    r = client.get("/suppliers")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] >= 15
    assert len(body["items"]) >= 15


def test_pipelines_has_three_keys():
    r = client.get("/pipelines")
    assert r.status_code == 200
    body = r.json()
    for key in ("blast_radius_$graphLookup",
                "supplier_$vectorSearch",
                "compliance_$vectorSearch_RAG"):
        assert key in body


def test_create_disruption_returns_id():
    r = client.post("/disruptions", json={
        "eventType": "Typhoon",
        "region": "Tanjung Pelepas, Malaysia",
        "product": "Automotive-grade MCU",
        "supplier": "SUP-001",
        "issue": "Port closed 72h — stock exists but cannot deliver.",
    })
    assert r.status_code == 200
    body = r.json()
    assert body.get("_id")
    assert body.get("alert_text")


def test_workflow_run_picks_backup_supplier():
    r = client.post("/workflow/run", json={
        "alert_text": (
            "Typhoon Yagi has closed the Port of Tanjung Pelepas (Malaysia). "
            "Primary supplier SUP-001 (Chang Electronics, Malaysia) cannot deliver "
            "23 active orders totalling 48,200 units of automotive-grade MCUs."
        )
    })
    assert r.status_code == 200
    state = r.json()
    brief = state.get("mitigation_brief") or {}
    assert brief.get("backup_supplier") == "SUP-002"
