"""Load backend/sample_data/{suppliers,orders}.json into Atlas `resiliochain`.

Strategy (user-approved): suppliers upsert-all; orders insert-new-only.
- Suppliers: replace_one(_id, upsert=True) for all 20. Synthesize the fields the
  live schema has but the JSON lacks: `embed_text` (drives $vectorSearch) and
  `disrupted`. Coerce `last_updated` to a real datetime.
- Orders: insert ONLY order_numbers not already present, so the canonical demo
  invariant (SUP-001 = 23 orders / 48,200 units) is left untouched. Coerce
  `created_at` to datetime.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings
from app.db.mongo import get_db

SAMPLE = Path(__file__).resolve().parent / "sample_data"
DISRUPTED = "SUP-001"


def _to_dt(v):
    """Coerce 'YYYY-MM-DD' (or ISO) strings to tz-aware datetime; pass through others."""
    if isinstance(v, str):
        try:
            return datetime.fromisoformat(v).replace(tzinfo=timezone.utc)
        except ValueError:
            return v
    return v


def _embed_text(s: dict) -> str:
    caps = ", ".join(s.get("capabilities", []))
    certs = ", ".join(s.get("certifications", [])) or "none"
    return (f"{s['name']} is a supplier in {s.get('geo_region', '')} offering {caps}. "
            f"Certifications: {certs}.")


def load_suppliers(db) -> dict:
    docs = json.loads((SAMPLE / "suppliers.json").read_text())
    before = db[settings.COL_SUPPLIERS].count_documents({})
    existing = {d["_id"] for d in db[settings.COL_SUPPLIERS].find({}, {"_id": 1})}
    updated, inserted = 0, 0
    for s in docs:
        s = dict(s)
        s.setdefault("embed_text", _embed_text(s))   # synthesize if absent
        s["disrupted"] = s["_id"] == DISRUPTED        # derived flag
        if "last_updated" in s:
            s["last_updated"] = _to_dt(s["last_updated"])
        db[settings.COL_SUPPLIERS].replace_one({"_id": s["_id"]}, s, upsert=True)
        if s["_id"] in existing:
            updated += 1
        else:
            inserted += 1
    after = db[settings.COL_SUPPLIERS].count_documents({})
    return {"before": before, "after": after, "updated": updated, "inserted": inserted}


def load_orders(db) -> dict:
    docs = json.loads((SAMPLE / "orders.json").read_text())
    before = db[settings.COL_ORDERS].count_documents({})
    existing = {d["order_number"] for d in
                db[settings.COL_ORDERS].find({}, {"order_number": 1})}
    new_docs = []
    for o in docs:
        if o["order_number"] in existing:
            continue                                   # new-only: never touch demo orders
        o = dict(o)
        if "created_at" in o:
            o["created_at"] = _to_dt(o["created_at"])
        # ensure graph edge exists for $graphLookup, matching live schema
        o.setdefault("depends_on", [o["supplier_id"]])
        new_docs.append(o)
    skipped = len(docs) - len(new_docs)
    if new_docs:
        db[settings.COL_ORDERS].insert_many(new_docs)
    after = db[settings.COL_ORDERS].count_documents({})
    return {"before": before, "after": after,
            "inserted": len(new_docs), "skipped_existing": skipped,
            "new_order_numbers": [d["order_number"] for d in new_docs]}


def main():
    db = get_db()
    print(f"DB: {settings.mongodb_db}\n")
    sup = load_suppliers(db)
    print(f"suppliers: {sup['before']} -> {sup['after']} "
          f"(updated {sup['updated']}, inserted {sup['inserted']})")
    ordr = load_orders(db)
    print(f"orders:    {ordr['before']} -> {ordr['after']} "
          f"(inserted {ordr['inserted']} new, skipped {ordr['skipped_existing']} existing)")
    print(f"  new order_numbers: {ordr['new_order_numbers']}")

    # Verify demo invariant + new-supplier presence
    imp = list(db[settings.COL_ORDERS].find({"depends_on": DISRUPTED}))
    total = sum(o.get("quantity_remaining", 0) for o in imp)
    print(f"\nINVARIANT  SUP-001 depends_on: {len(imp)} orders / {total} units "
          f"(expect 23 / 48200) -> {'OK' if (len(imp), total) == (23, 48200) else 'CHANGED'}")
    new_sups = list(db[settings.COL_SUPPLIERS].find(
        {"_id": {"$in": ["SUP-015", "SUP-016", "SUP-017", "SUP-018", "SUP-019"]}},
        {"_id": 1}))
    print(f"new suppliers present: {sorted(s['_id'] for s in new_sups)}")
    missing_embed = db[settings.COL_SUPPLIERS].count_documents(
        {"embed_text": {"$exists": False}})
    print(f"suppliers missing embed_text: {missing_embed} (expect 0)")


if __name__ == "__main__":
    main()
