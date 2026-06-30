"""Explicit Voyage AI query embedding (used only when EMBEDDING_MODE=explicit)."""
from __future__ import annotations

from functools import lru_cache

from app.config import settings


@lru_cache
def _client():
    import voyageai
    return voyageai.Client(api_key=settings.voyage_api_key)


def embed_query(text: str) -> list[float]:
    res = _client().embed([text], model=settings.voyage_model, input_type="query")
    return res.embeddings[0]
