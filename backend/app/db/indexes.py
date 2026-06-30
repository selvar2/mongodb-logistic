"""Create MongoDB indexes for ResilioChain.

Two kinds:
  1. Regular b-tree indexes that make `$graphLookup` and lookups fast (orders).
  2. Atlas Vector Search indexes (type `vectorSearch`) with Voyage AI **autoEmbed**
     on suppliers and compliance_policies, so embeddings are generated/managed by
     Atlas at index- and query-time.

Run:  python -m app.db.indexes
      python -m app.db.indexes --wait      # also poll until vector indexes are queryable

If EMBEDDING_MODE=explicit, the vector indexes are created over a plain `vector`
field of the given dimensions instead of autoEmbed (you must have populated
`embedding` in seed.py).
"""
from __future__ import annotations

import argparse
import time

from pymongo.operations import SearchIndexModel

from app.config import settings
from app.db.mongo import col

VOYAGE_MODEL = "voyage-4"
# voyage-4 default output dimensions (used only in explicit mode)
EXPLICIT_DIMS = 1024


def create_regular_indexes() -> list[str]:
    orders = col(settings.COL_ORDERS)
    created = [
        orders.create_index("supplier_id"),
        orders.create_index("status"),
        orders.create_index("depends_on"),
        orders.create_index("order_number", unique=True),
    ]
    # plans / audit / checkpoints lookups
    col(settings.COL_PLANS).create_index("thread_id")
    col(settings.COL_AUDIT).create_index([("thread_id", 1), ("ts", 1)])
    col(settings.COL_CHECKPOINTS).create_index([("thread_id", 1), ("ts", 1)])
    return created


def _vector_definition(text_path: str, filters: list[str]) -> dict:
    if settings.embedding_mode == "explicit":
        fields = [{
            "type": "vector",
            "path": "embedding",
            "numDimensions": EXPLICIT_DIMS,
            "similarity": "cosine",
        }]
    else:  # autoembed (Voyage AI managed by Atlas)
        fields = [{
            "type": "autoEmbed",
            "modality": "text",
            "path": text_path,
            "model": VOYAGE_MODEL,
        }]
    fields += [{"type": "filter", "path": f} for f in filters]
    return {"fields": fields}


def create_vector_index(collection: str, name: str, text_path: str,
                        filters: list[str]) -> str:
    c = col(collection)
    existing = {ix["name"] for ix in c.list_search_indexes()}
    if name in existing:
        print(f"  vector index '{name}' already exists on {collection} — dropping & recreating")
        c.drop_search_index(name)
        # wait for drop to settle
        for _ in range(30):
            if name not in {ix["name"] for ix in c.list_search_indexes()}:
                break
            time.sleep(2)
    model = SearchIndexModel(
        definition=_vector_definition(text_path, filters),
        name=name,
        type="vectorSearch",
    )
    c.create_search_index(model)
    print(f"  created vector index '{name}' on {collection} "
          f"(mode={settings.embedding_mode}, model={VOYAGE_MODEL})")
    return name


def wait_until_queryable(collection: str, name: str, timeout_s: int = 300) -> bool:
    c = col(collection)
    start = time.time()
    while time.time() - start < timeout_s:
        for ix in c.list_search_indexes():
            if ix["name"] == name and ix.get("queryable"):
                print(f"  ✓ '{name}' on {collection} is queryable "
                      f"({int(time.time()-start)}s)")
                return True
        time.sleep(5)
    print(f"  ⚠ '{name}' on {collection} not queryable after {timeout_s}s")
    return False


def build_all(wait: bool = False) -> None:
    print("Creating regular indexes...")
    create_regular_indexes()
    print("Creating Atlas Vector Search indexes...")
    create_vector_index(settings.COL_SUPPLIERS, settings.IDX_SUPPLIER_VECTOR,
                        "embed_text", ["capacity_units_month", "geo_region", "esg_score"])
    create_vector_index(settings.COL_POLICIES, settings.IDX_POLICY_VECTOR,
                        "text", ["policy_type"])
    if wait:
        print("Waiting for vector indexes to become queryable...")
        wait_until_queryable(settings.COL_SUPPLIERS, settings.IDX_SUPPLIER_VECTOR)
        wait_until_queryable(settings.COL_POLICIES, settings.IDX_POLICY_VECTOR)
    print("Done.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--wait", action="store_true", help="poll until vector indexes are queryable")
    args = ap.parse_args()
    build_all(wait=args.wait)
