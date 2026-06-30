"""Canonical GraphRAG endpoints — isolated from the core workflow."""
from __future__ import annotations

import json

from fastapi import APIRouter
from pydantic import BaseModel

from app import graphrag
from app.config import settings
from app.db.mongo import col

router = APIRouter(tags=["graphrag"])


def _safe(x):
    return json.loads(json.dumps(x, default=str))


class ExtractIn(BaseModel):
    text: str
    source: str = "disruption"


class AskIn(BaseModel):
    question: str
    max_hops: int = 3


@router.post("/graphrag/extract")
def extract(body: ExtractIn) -> dict:
    return _safe(graphrag.extract_graph(body.text, body.source))


@router.post("/graphrag/ask")
def ask(body: AskIn) -> dict:
    sub = graphrag.query_graph(body.question, body.max_hops)
    ans = graphrag.answer(body.question, sub)
    return _safe({"question": body.question, "answer": ans,
                  "seeds": sub["seeds"], "subgraph": sub["subgraph"],
                  "edges": sub["edges"], "pipeline": sub["pipeline"]})


@router.get("/graphrag/graph")
def graph() -> dict:
    return _safe(graphrag.graph_snapshot())


@router.delete("/graphrag/graph")
def clear() -> dict:
    col(graphrag.COLL).delete_many({})
    return {"cleared": True}
