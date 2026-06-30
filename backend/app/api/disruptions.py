"""Disruption intake + listing."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import settings
from app.db.mongo import col

router = APIRouter(tags=["disruptions"])


class DisruptionIn(BaseModel):
    eventType: str = Field(..., examples=["Typhoon"])
    region: str = Field(..., examples=["Tanjung Pelepas, Malaysia"])
    product: Optional[str] = Field(None, examples=["Automotive-grade MCU"])
    supplier: Optional[str] = Field(None, examples=["SUP-001"])
    issue: str = Field(..., examples=["Port closed 72h — stock exists but cannot deliver"])

    def to_alert_text(self) -> str:
        parts = [f"{self.eventType} affecting {self.region}."]
        if self.supplier:
            parts.append(f"Primary supplier {self.supplier} is impacted.")
        if self.product:
            parts.append(f"Product: {self.product}.")
        parts.append(self.issue)
        return " ".join(parts)


@router.post("/disruptions")
def create_disruption(body: DisruptionIn) -> dict:
    doc = {
        "_id": uuid.uuid4().hex,
        "alert_text": body.to_alert_text(),
        "eventType": body.eventType,
        "region": body.region,
        "product": body.product,
        "supplier_id": body.supplier,
        "issue": body.issue,
        "status": "created",
        "created_at": datetime.now(timezone.utc),
    }
    col(settings.COL_DISRUPTIONS).insert_one(doc)
    doc["created_at"] = doc["created_at"].isoformat()
    return doc


@router.get("/disruptions")
def list_disruptions(limit: int = 50) -> dict:
    docs = list(col(settings.COL_DISRUPTIONS).find().sort("created_at", -1).limit(limit))
    for d in docs:
        d["created_at"] = d.get("created_at").isoformat() if d.get("created_at") else None
    return {"count": len(docs), "items": docs}


@router.get("/disruptions/{disruption_id}")
def get_disruption(disruption_id: str) -> dict:
    doc = col(settings.COL_DISRUPTIONS).find_one({"_id": disruption_id})
    if not doc:
        raise HTTPException(status_code=404, detail="disruption not found")
    doc["created_at"] = doc.get("created_at").isoformat() if doc.get("created_at") else None
    return doc
