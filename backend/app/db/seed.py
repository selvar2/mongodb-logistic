"""Seed the `resiliochain` database with the canonical demo dataset.

Demo scenario (Typhoon Yagi):
  - SUP-001 (Chang Electronics, Malaysia) is the DISRUPTED supplier.
  - 23 active orders depend on SUP-001, totalling exactly 48,200 units remaining.
  - SUP-FAIL (Vietnam, esg_score=22) must be REJECTED on ESG.
  - SUP-002 (PT Maju Jaya, Indonesia) is the WINNING compliant backup.

Run:  python -m app.db.seed            # uses .env config
      python -m app.db.seed --drop     # drop collections first

Embedding:
  - EMBEDDING_MODE=autoembed (default): insert text only; Atlas Voyage AI generates
    `embedding` once the vector index exists (Phase 2).
  - EMBEDDING_MODE=explicit: if VOYAGE_API_KEY is set, embeddings are generated here.
"""
from __future__ import annotations

import argparse
import random
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.db.mongo import col, get_db

RNG = random.Random(42)
NOW = datetime(2026, 6, 30, tzinfo=timezone.utc)

SKU_POOL = [
    "MCU-32X", "SEN-IMU9", "CAP-470UF", "MCU-16Z",
    "SEN-TEMP4", "REG-3V3", "DIODE-SCH", "XTAL-16M",
]
DISRUPTED_SUPPLIER = "SUP-001"
ORIGINAL_UNIT_PRICE = 2.50
ROUTE = {"origin": "Shanghai", "destination": "Hamburg", "via_port": "Singapore"}

# ---------------------------------------------------------------------------
# M2 — suppliers
# ---------------------------------------------------------------------------
def build_suppliers() -> list[dict]:
    """15 suppliers incl. the 3 named demo actors. Some lack capacity on purpose.

    Capabilities are differentiated so vector similarity is meaningful: the impacted
    demand is automotive-grade 32-bit MCUs AND sensor components, so suppliers offering
    BOTH MCUs and sensors (SUP-002 winner, SUP-FAIL) are the closest semantic matches.
    """
    mcu = ["automotive-grade microcontrollers", "32-bit MCU", "AEC-Q100 certified"]
    mcu_sens = mcu + ["MEMS sensors", "IMU sensor modules", "automotive sensor components"]
    sens_only = ["MEMS sensors", "IMU sensor modules", "automotive sensor components"]
    base = [
        # _id, name, region, capabilities, capacity, lead, esg, certs, price_mult
        ("SUP-001", "Chang Electronics", "Malaysia", mcu_sens, 50000, 20, 70,
         ["ISO-14001", "AEC-Q100"], 1.00),                       # disrupted
        ("SUP-002", "PT Maju Jaya Electronics", "Indonesia", mcu_sens, 60000, 21, 88,
         ["ISO-14001", "carbon-neutral-2024", "AEC-Q100"], 1.08),  # WINNER: MCU+sensor, low cost
        ("SUP-FAIL", "Vina Components Co.", "Vietnam", mcu_sens, 55000, 18, 22,
         [], 1.05),                                              # high match, fails ESG
        ("SUP-003", "Seoul Semiconductors", "South Korea", mcu, 70000, 24, 90,
         ["ISO-14001", "carbon-neutral-2024", "AEC-Q100"], 1.12),  # MCU only -> lower match
        ("SUP-004", "Bandung MicroTech", "Indonesia", mcu_sens, 52000, 28, 81,
         ["ISO-14001", "AEC-Q100"], 1.10),
        ("SUP-005", "Busan Chip Works", "South Korea", mcu, 48500, 30, 84,
         ["ISO-14001", "AEC-Q100"], 1.14),
        ("SUP-006", "Penang Precision", "Malaysia", mcu, 30000, 16, 76,
         ["AEC-Q100"], 1.06),       # low capacity (< 48,200) -> filtered out
        ("SUP-007", "Surabaya Components", "Indonesia", sens_only, 25000, 22, 79,
         ["ISO-14001"], 1.09),      # low capacity + sensors only
        ("SUP-008", "Hanoi Circuits", "Vietnam", mcu, 51000, 19, 35,
         [], 1.04),                 # Vietnam + low ESG (secondary fail)
        ("SUP-009", "Daegu Electronics", "South Korea", mcu, 64000, 27, 86,
         ["ISO-14001", "AEC-Q100"], 1.13),
        ("SUP-010", "Jakarta SemiCon", "Indonesia", mcu, 47000, 23, 80,
         ["ISO-14001"], 1.07),      # just under capacity
        ("SUP-011", "Kuala Lumpur Chips", "Malaysia", mcu, 58000, 17, 72,
         ["AEC-Q100"], 1.05),       # in disrupted region (Malaysia) -> excluded by region
        ("SUP-012", "Incheon MicroDevices", "South Korea", mcu, 53000, 29, 89,
         ["ISO-14001", "carbon-neutral-2024"], 1.15),
        ("SUP-013", "Medan Semiconductor", "Indonesia", mcu_sens, 49000, 26, 83,
         ["ISO-14001", "AEC-Q100"], 1.11),
        ("SUP-014", "Ulsan Components", "South Korea", sens_only, 40000, 25, 85,
         ["ISO-14001"], 1.10),      # sensors only + low capacity
    ]
    docs = []
    for _id, name, region, caps, cap, lead, esg, certs, mult in base:
        embed_text = (f"{name} is a supplier in {region} offering {', '.join(caps)}. "
                      f"Certifications: {', '.join(certs) or 'none'}.")
        docs.append({
            "_id": _id,
            "name": name,
            "capabilities": caps,
            "capacity_units_month": cap,
            "geo_region": region,
            "lead_time_days": lead,
            "esg_score": esg,
            "certifications": certs,
            "unit_price": round(ORIGINAL_UNIT_PRICE * mult, 4),
            "embed_text": embed_text,
            "last_updated": NOW,
            "disrupted": _id == DISRUPTED_SUPPLIER,
        })
    return docs


# ---------------------------------------------------------------------------
# M1 — orders
# ---------------------------------------------------------------------------
def build_orders(other_supplier_ids: list[str]) -> list[dict]:
    """30 orders ORD-1044..ORD-1073.

    23 depend on SUP-001 with quantity_remaining summing to exactly 48,200.
    The other 7 depend on unrelated suppliers (selective blast radius).
    """
    orders: list[dict] = []
    n_impacted = 23
    target_remaining = 48200

    # distribute target across 23 orders
    base = target_remaining // n_impacted
    remainders = [base] * n_impacted
    for i in range(target_remaining - base * n_impacted):
        remainders[i] += 1
    RNG.shuffle(remainders)

    num = 1044
    for i in range(n_impacted):
        remaining = remainders[i]
        # ordered is slightly more than remaining (80-95% fulfilled -> remaining is 80-95%)
        ordered = round(remaining / RNG.uniform(0.80, 0.95))
        skus = RNG.sample(SKU_POOL, RNG.choice([3, 4]))
        orders.append(_order(num, "active", skus, DISRUPTED_SUPPLIER, ordered, remaining))
        num += 1

    for i in range(7):
        sup = other_supplier_ids[i % len(other_supplier_ids)]
        ordered = RNG.randint(5000, 20000)
        remaining = round(ordered * RNG.uniform(0.80, 0.95))
        skus = RNG.sample(SKU_POOL, RNG.choice([3, 4]))
        orders.append(_order(num, "active", skus, sup, ordered, remaining))
        num += 1

    return orders


def _bom_for(sku: str) -> dict:
    """Polymorphic BOM: the embedded sub-document's SHAPE varies by SKU family,
    demonstrating MongoDB's flexible/polymorphic document model in one collection."""
    fam = sku.split("-", 1)[0]
    common = {"part_number": sku, "grade": "AEC-Q100"}
    if fam == "MCU":
        return {**common, "type": "microcontroller", "core": "ARM Cortex-M",
                "flash_kb": RNG.choice([256, 512, 1024]), "package": RNG.choice(["LQFP-64", "BGA-100"])}
    if fam == "SEN":
        return {**common, "type": "sensor", "modality": RNG.choice(["IMU", "temperature", "pressure"]),
                "axes": RNG.choice([3, 6, 9]), "sensitivity": f"{RNG.choice([2,4,8])}g"}
    if fam == "CAP":
        return {**common, "type": "capacitor", "capacitance_uf": RNG.choice([47, 100, 470]),
                "voltage_v": RNG.choice([16, 25, 50]), "tolerance_pct": RNG.choice([5, 10, 20])}
    if fam == "REG":
        return {**common, "type": "regulator", "output_v": RNG.choice([1.8, 3.3, 5.0]),
                "current_a": RNG.choice([0.5, 1.0, 3.0]), "topology": RNG.choice(["LDO", "buck"])}
    if fam == "DIODE":
        return {**common, "type": "diode", "diode_type": "Schottky",
                "forward_voltage_v": RNG.choice([0.3, 0.45]), "package": "SOD-123"}
    if fam == "XTAL":
        return {**common, "type": "crystal", "frequency_mhz": RNG.choice([8, 16, 25]),
                "load_pf": RNG.choice([12, 18, 20]), "stability_ppm": RNG.choice([10, 20, 30])}
    return {**common, "type": "component", "spec": "automotive-grade"}


def _order(num: int, status: str, skus: list[str], supplier_id: str,
           ordered: int, remaining: int) -> dict:
    return {
        "order_number": f"ORD-{num}",
        "status": status,
        "sku_ids": skus,
        "supplier_id": supplier_id,
        "quantity_ordered": ordered,
        "quantity_remaining": remaining,
        "route": dict(ROUTE),
        "bom": _bom_for(skus[0]),      # polymorphic: shape varies by SKU family
        "depends_on": [supplier_id],   # graph edge for $graphLookup
        "unit_price": ORIGINAL_UNIT_PRICE,
        "created_at": NOW - timedelta(days=RNG.randint(1, 90)),
    }


# ---------------------------------------------------------------------------
# M3 — compliance_policies
# ---------------------------------------------------------------------------
def build_policies() -> list[dict]:
    chunks: list[tuple[str, str, str]] = []  # (source_doc, policy_type, text)

    # Vietnam risk chunks (retrieved for SUP-FAIL / Vietnam) -- at least 3
    chunks += [
        ("Labour_Standards.pdf", "labour",
         "Suppliers operating in Vietnam are flagged as elevated risk for child labour and "
         "forced overtime in electronics assembly. Independent audits are mandatory and any "
         "supplier with an ESG score below 40 in this region must be excluded from sourcing."),
        ("2025_ESG_Guidelines.pdf", "ESG",
         "Vietnam manufacturing ESG concerns: facilities have repeatedly failed environmental "
         "discharge and labour-welfare inspections. Procurement teams must reject Vietnamese "
         "suppliers lacking ISO-14001 certification and a current ESG score of at least 60."),
        ("2025_ESG_Guidelines.pdf", "labour",
         "Documented Vietnam child labour risk in the semiconductor supply chain requires "
         "enhanced due diligence. Suppliers without verified labour-standards certification "
         "are non-compliant and may not be recommended for critical fulfilment."),
        ("Trade_Sanctions_2025.pdf", "trade_sanction",
         "Certain Vietnamese export entities appear on restricted-party watch lists. Confirm "
         "the supplier is not a designated party before approving cross-border fulfilment."),
    ]

    # Compliant-region chunks: Indonesia + South Korea -- at least 3
    chunks += [
        ("2025_ESG_Guidelines.pdf", "ESG",
         "Indonesia: suppliers holding ISO-14001 and carbon-neutral certification with an ESG "
         "score above 75 are considered fully compliant and preferred for automotive-grade "
         "electronics sourcing."),
        ("Labour_Standards.pdf", "labour",
         "Indonesian electronics manufacturers participating in the 2024 fair-labour accord meet "
         "international labour standards; no labour exclusion applies when certifications are current."),
        ("2025_ESG_Guidelines.pdf", "ESG",
         "South Korea: semiconductor suppliers consistently exceed environmental and labour "
         "benchmarks. Suppliers with ESG scores above 80 and AEC-Q100 certification pass all "
         "compliance dimensions for automotive components."),
        ("Trade_Sanctions_2025.pdf", "trade_sanction",
         "No trade sanctions or restricted-party designations currently apply to electronics "
         "suppliers in Indonesia or South Korea."),
        ("Carbon_Policy_2025.pdf", "carbon",
         "Carbon-offset requirement: backup suppliers must hold carbon-neutral-2024 or commit to "
         "a verified offset programme. Indonesian and South Korean certified suppliers satisfy this."),
    ]

    # Generic policy chunks to reach 30+ (varied policy types)
    generics = [
        ("ESG", "All suppliers must maintain a current Environmental, Social and Governance score. "
                "Scores below 60 trigger mandatory review; scores below 40 are automatic exclusions."),
        ("ESG", "Annual third-party ESG audits are required for all tier-1 automotive suppliers."),
        ("labour", "Forced labour, child labour and excessive overtime are prohibited across the supply base."),
        ("labour", "Suppliers must provide verifiable working-hour and wage records on request."),
        ("trade_sanction", "Cross-border shipments must be screened against current sanctions lists."),
        ("trade_sanction", "Dual-use export controls apply to certain microcontroller grades."),
        ("carbon", "Scope-3 emissions from logistics must be reported for all reroute decisions."),
        ("carbon", "Preference is given to suppliers with carbon-neutral certification."),
        ("ESG", "Conflict-mineral sourcing must comply with OECD due-diligence guidance."),
        ("labour", "Health and safety certification (ISO-45001 or equivalent) is recommended."),
        ("trade_sanction", "Re-export of controlled components requires a compliance sign-off."),
        ("carbon", "Lead-time vs carbon trade-offs should favour lower-emission routing when feasible."),
        ("ESG", "Suppliers in disaster-affected regions are temporarily de-prioritised until verified."),
        ("ESG", "AEC-Q100 certification is required for automotive-grade microcontroller suppliers."),
        ("labour", "Grievance mechanisms must be available to all supplier-site workers."),
        ("trade_sanction", "Beneficial-ownership checks are required for new supplier onboarding."),
        ("carbon", "Carbon variance beyond 15% versus baseline requires explicit approval."),
        ("ESG", "Water and hazardous-waste discharge must meet local and international limits."),
        ("ESG", "Suppliers must disclose subcontractors used for critical components."),
        ("labour", "Minimum-wage compliance is verified during onboarding and annual review."),
        ("trade_sanction", "Shipments transiting sanctioned ports require alternate routing."),
        ("carbon", "Renewable-energy usage at supplier facilities is a scoring bonus."),
        ("ESG", "Repeated compliance failures result in supplier suspension."),
    ]
    for ptype, text in generics:
        chunks.append(("2025_ESG_Guidelines.pdf" if ptype in ("ESG", "carbon")
                       else ("Labour_Standards.pdf" if ptype == "labour"
                             else "Trade_Sanctions_2025.pdf"), ptype, text))

    docs = []
    counters: dict[str, int] = {}
    for source_doc, ptype, text in chunks:
        idx = counters.get(source_doc, 0)
        counters[source_doc] = idx + 1
        docs.append({
            "source_doc": source_doc,
            "chunk_index": idx,
            "text": text,
            "policy_type": ptype,
            "effective_date": datetime(2025, 1, 1, tzinfo=timezone.utc),
        })
    return docs


# ---------------------------------------------------------------------------
# Optional explicit embedding
# ---------------------------------------------------------------------------
def _maybe_embed(docs: list[dict], text_field: str) -> None:
    if settings.embedding_mode != "explicit":
        return
    if not settings.voyage_api_key:
        print("  [explicit mode] VOYAGE_API_KEY not set — skipping embedding; "
              "set it or switch EMBEDDING_MODE=autoembed.")
        return
    import voyageai
    client = voyageai.Client(api_key=settings.voyage_api_key)
    texts = [d[text_field] for d in docs]
    # batch in groups of 100
    out: list[list[float]] = []
    for i in range(0, len(texts), 100):
        res = client.embed(texts[i:i + 100], model=settings.voyage_model, input_type="document")
        out.extend(res.embeddings)
    for d, emb in zip(docs, out):
        d["embedding"] = emb
    print(f"  [explicit mode] embedded {len(out)} docs ({text_field}) with {settings.voyage_model}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def seed(drop: bool = False) -> dict:
    db = get_db()
    suppliers = build_suppliers()
    other_ids = [s["_id"] for s in suppliers if s["_id"] not in (DISRUPTED_SUPPLIER, "SUP-FAIL")][:5]
    orders = build_orders(other_ids)
    policies = build_policies()

    _maybe_embed(suppliers, "embed_text")
    _maybe_embed(policies, "text")

    targets = {
        settings.COL_SUPPLIERS: suppliers,
        settings.COL_ORDERS: orders,
        settings.COL_POLICIES: policies,
    }
    empty = [settings.COL_CHECKPOINTS, settings.COL_PLANS,
             settings.COL_AUDIT, settings.COL_DISRUPTIONS]

    if drop:
        for name in list(targets) + empty:
            db[name].drop()
        print("Dropped existing collections.")

    counts = {}
    for name, docs in targets.items():
        db[name].delete_many({})
        db[name].insert_many(docs)
        counts[name] = db[name].count_documents({})
    for name in empty:
        db[name]  # touch (created lazily on first insert)
        counts[name] = db[name].count_documents({})

    # sanity: SUP-001 impacted remaining sum
    impacted = list(db[settings.COL_ORDERS].find({"depends_on": DISRUPTED_SUPPLIER}))
    total_remaining = sum(o["quantity_remaining"] for o in impacted)
    print(f"\nSeed complete into '{settings.mongodb_db}':")
    for k, v in counts.items():
        print(f"  {k:22s} {v}")
    print(f"\n  SUP-001 impacted orders: {len(impacted)} | "
          f"sum(quantity_remaining) = {total_remaining}")
    return {"counts": counts, "impacted_orders": len(impacted),
            "required_capacity": total_remaining}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--drop", action="store_true", help="drop collections before seeding")
    args = ap.parse_args()
    seed(drop=args.drop)
