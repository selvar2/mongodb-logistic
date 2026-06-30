"""Helper to run a $vectorSearch pipeline with rate-limit backoff.

Atlas-managed Voyage AI autoEmbed has a 3 RPM / 10K TPM free-tier limit (until a
payment method is added). We retry on the embedding rate-limit error with spacing.
"""
from __future__ import annotations

import time

from pymongo.errors import OperationFailure

from app.db.mongo import col

_RATE_HINTS = ("rate limit", "ratelimit", "429", "RateLimit")


def run_vector_pipeline(collection: str, pipeline: list[dict],
                        max_retries: int = 4, base_sleep: int = 21) -> list[dict]:
    last: Exception | None = None
    for attempt in range(max_retries):
        try:
            return list(col(collection).aggregate(pipeline))
        except OperationFailure as exc:
            msg = str(exc)
            if any(h.lower() in msg.lower() for h in _RATE_HINTS):
                wait = base_sleep + attempt * 5
                print(f"  [vector-search] Voyage rate limit — retry "
                      f"{attempt+1}/{max_retries} in {wait}s")
                time.sleep(wait)
                last = exc
                continue
            raise
    raise RuntimeError(f"vector search failed after retries: {last}")
