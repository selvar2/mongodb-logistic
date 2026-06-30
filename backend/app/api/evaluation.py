"""AI evaluation endpoints — MongoDB-native, isolated from the core workflow."""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException

from app import evaluation

router = APIRouter(tags=["evaluation"])


def _safe(x):
    return json.loads(json.dumps(x, default=str))


@router.post("/evaluation/run")
def run() -> dict:
    return _safe(evaluation.run_eval())


@router.get("/evaluation/latest")
def latest() -> dict:
    doc = evaluation.latest()
    if not doc:
        raise HTTPException(404, "no evaluation runs yet — POST /evaluation/run")
    return _safe(doc)


@router.get("/evaluation/dataset")
def dataset() -> dict:
    return {"count": len(evaluation.dataset()), "cases": _safe(evaluation.dataset())}


@router.get("/evaluation/history")
def history() -> dict:
    return {"runs": _safe(evaluation.history())}
