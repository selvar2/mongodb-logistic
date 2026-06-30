"""Canonical GraphRAG (MongoDBGraphStore-style) — an ISOLATED retrieval mode.

Unlike the core workflow's hand-modeled blast-radius graph, this implements the
canonical pattern:
  1. extract_graph(text) — Bedrock extracts entities + relationships from unstructured
     disruption text into the `knowledge_graph` collection (one doc per entity).
  2. query_graph(question) — seed entities from the question, then MULTI-HOP $graphLookup
     traverses the relationship edges to retrieve the connected subgraph.
  3. answer(question, subgraph) — Bedrock answers grounded ONLY in the retrieved subgraph.

Runs on Bedrock with a deterministic mock fallback (no credentials needed). Stores nothing
in the core collections — fully separate.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone

from app.config import settings
from app.db.mongo import col
from app.llm import bedrock

COLL = "knowledge_graph"

# ---------------------------------------------------------------------------
# 1. Entity + relationship extraction
# ---------------------------------------------------------------------------
EXTRACT_SYS = (
    "You extract a knowledge graph from supply-chain disruption text. Return JSON: "
    '{"entities":[{"name":"...","type":"supplier|order|region|product|event|port"}],'
    '"relationships":[{"source":"...","target":"...","relation":"..."}]}. '
    "Use exact identifiers when present (e.g. SUP-001, ORD-1044). No prose."
)

_SUP = re.compile(r"\bSUP-[A-Z0-9]+\b", re.I)
_ORD = re.compile(r"\bORD-\d+\b", re.I)
_REGIONS = ["Malaysia", "Vietnam", "Indonesia", "South Korea", "Tanjung Pelepas",
            "Singapore", "Shanghai", "Hamburg"]
_EVENTS = ["Typhoon", "Cyclone", "Yagi", "earthquake", "war", "sanctions", "flood",
           "port closure", "blockade"]


def _mock_extract(text: str) -> dict:
    """Deterministic extractor so the feature works with no LLM."""
    ents, rels = {}, []
    def add(name, typ):
        ents.setdefault(name, typ)
    sups = sorted({m.group(0).upper() for m in _SUP.finditer(text)})
    ords_ = sorted({m.group(0).upper() for m in _ORD.finditer(text)})
    regions = [r for r in _REGIONS if r.lower() in text.lower()]
    events = [e for e in _EVENTS if e.lower() in text.lower()]
    for s in sups: add(s, "supplier")
    for o in ords_: add(o, "order")
    for r in regions: add(r, "region")
    for e in events: add(e, "event")
    if "MCU" in text or "microcontroller" in text.lower():
        add("automotive-grade MCU", "product")
    # relationships
    primary = sups[0] if sups else None
    if primary and regions:
        rels.append({"source": primary, "target": regions[0], "relation": "located_in"})
    for e in events:
        for r in regions:
            rels.append({"source": e, "target": r, "relation": "affects"})
    if primary:
        for o in ords_:
            rels.append({"source": o, "target": primary, "relation": "depends_on"})
        if "automotive-grade MCU" in ents:
            rels.append({"source": primary, "target": "automotive-grade MCU",
                         "relation": "supplies"})
    return {"entities": [{"name": n, "type": t} for n, t in ents.items()],
            "relationships": rels}


def extract_graph(text: str, source: str = "disruption") -> dict:
    data = bedrock.complete_json(
        EXTRACT_SYS, text, agent="graphrag-extract",
        mock_fn=lambda: _mock_extract(text), max_tokens=1200)
    entities = data.get("entities", []) or []
    rels = data.get("relationships", []) or []

    # build adjacency: edges grouped by source entity
    edges_by_src: dict[str, list[dict]] = {}
    for r in rels:
        s, t = r.get("source"), r.get("target")
        if s and t:
            edges_by_src.setdefault(s, []).append({"target": t, "relation": r.get("relation", "related")})

    now = datetime.now(timezone.utc)
    c = col(COLL)
    types = {e["name"]: e.get("type", "entity") for e in entities if e.get("name")}
    # ensure every referenced node exists
    for r in rels:
        for n in (r.get("source"), r.get("target")):
            types.setdefault(n, "entity")
    for name, typ in types.items():
        rel = edges_by_src.get(name, [])
        c.update_one({"_id": name}, {"$set": {
            "type": typ,
            "edges": [e["target"] for e in rel],
            "relations": rel,
            "updated_at": now,
        }, "$addToSet": {"sources": source}}, upsert=True)

    return {"entities": len(types), "relationships": len(rels),
            "nodes": [{"name": n, "type": t, "edges": edges_by_src.get(n, [])}
                      for n, t in types.items()]}


# ---------------------------------------------------------------------------
# 2. Multi-hop $graphLookup retrieval
# ---------------------------------------------------------------------------
def _seed_entities(question: str) -> list[str]:
    c = col(COLL)
    ids = [d["_id"] for d in c.find({}, {"_id": 1})]
    q = question.lower()
    seeds = [i for i in ids if i.lower() in q]
    if not seeds:  # keyword fallback: match on token overlap
        for i in ids:
            if any(tok and tok in q for tok in re.split(r"[\s\-]", i.lower()) if len(tok) > 3):
                seeds.append(i)
    return seeds[:5]


def _pipeline(seeds: list[str], max_hops: int) -> list[dict]:
    return [
        {"$match": {"_id": {"$in": seeds}}},
        {"$graphLookup": {
            "from": COLL,
            "startWith": "$edges",
            "connectFromField": "edges",
            "connectToField": "_id",
            "as": "connected",
            "maxDepth": max_hops - 1,
            "depthField": "hop",
        }},
    ]


def query_graph(question: str, max_hops: int = 3) -> dict:
    seeds = _seed_entities(question)
    if not seeds:
        return {"seeds": [], "subgraph": [], "edges": [], "pipeline": _pipeline([], max_hops)}
    pipeline = _pipeline(seeds, max_hops)
    res = list(col(COLL).aggregate(pipeline))
    nodes: dict[str, dict] = {}
    edges: list[dict] = []
    for root in res:
        nodes[root["_id"]] = {"name": root["_id"], "type": root.get("type"), "hop": 0}
        for e in root.get("relations", []):
            edges.append({"source": root["_id"], "target": e["target"], "relation": e["relation"]})
        for conn in root.get("connected", []):
            nodes.setdefault(conn["_id"], {"name": conn["_id"], "type": conn.get("type"),
                                           "hop": conn.get("hop", 0) + 1})
            for e in conn.get("relations", []):
                edges.append({"source": conn["_id"], "target": e["target"],
                              "relation": e["relation"]})
    return {"seeds": seeds, "subgraph": list(nodes.values()), "edges": edges, "pipeline": pipeline}


# ---------------------------------------------------------------------------
# 3. Grounded answer
# ---------------------------------------------------------------------------
ANSWER_SYS = (
    "You answer questions about a supply chain using ONLY the provided knowledge-graph "
    "subgraph (entities + relationships). Be concise and cite the entities/relations you used. "
    "If the subgraph doesn't contain the answer, say so."
)


def _mock_answer(question: str, sub: dict) -> str:
    if not sub["subgraph"]:
        return "No connected entities were found in the knowledge graph for this question."
    seeds = ", ".join(sub["seeds"])
    rels = "; ".join(f"{e['source']} —{e['relation']}→ {e['target']}" for e in sub["edges"][:8])
    return (f"Starting from {seeds}, the multi-hop graph traversal found "
            f"{len(sub['subgraph'])} connected entities. Key relationships: {rels}.")


def answer(question: str, sub: dict) -> str:
    context = json.dumps({"entities": sub["subgraph"], "relationships": sub["edges"]}, default=str)
    return bedrock.complete_text(
        ANSWER_SYS, f"Question: {question}\n\nSubgraph:\n{context}",
        agent="graphrag-answer", mock_fn=lambda: _mock_answer(question, sub), max_tokens=400)


def graph_snapshot() -> dict:
    c = col(COLL)
    nodes = list(c.find({}, {"_id": 1, "type": 1, "edges": 1, "relations": 1}))
    edges = [{"source": n["_id"], "target": e["target"], "relation": e["relation"]}
             for n in nodes for e in n.get("relations", [])]
    return {"nodes": [{"name": n["_id"], "type": n.get("type"),
                       "degree": len(n.get("edges", []))} for n in nodes],
            "edges": edges, "count": len(nodes)}
