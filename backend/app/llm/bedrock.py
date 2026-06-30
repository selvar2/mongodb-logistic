"""LLM provider abstraction.

`complete_json()` returns a parsed JSON object from the model. Two backends:
  - bedrock: AWS Bedrock Claude via the Converse API (boto3).
  - mock:    deterministic stub (set LLM_MODE=mock, or automatic fallback on error).

Agents must not call boto3 directly — they go through this module so the vendor
is swappable and the graph runs even without cloud credentials.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from typing import Any

from app.config import settings


class LLMError(Exception):
    pass


@lru_cache
def _client():
    import boto3
    return boto3.client(
        "bedrock-runtime",
        region_name=settings.aws_region,
        aws_access_key_id=settings.aws_access_key_id or None,
        aws_secret_access_key=settings.aws_secret_access_key or None,
    )


def _extract_json(text: str) -> dict:
    text = text.strip()
    # strip ```json fences
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.MULTILINE).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            return json.loads(m.group(0))
        raise LLMError(f"Model did not return JSON: {text[:200]}")


def complete_json(system: str, user: str, *, model: str | None = None,
                  agent: str = "", mock_fn=None, max_tokens: int = 1024) -> dict:
    """Return a JSON object from the model.

    If LLM_MODE=mock (or Bedrock fails and a mock_fn is supplied), use the deterministic
    stub so the workflow always completes.
    """
    if settings.llm_mode == "mock":
        if mock_fn is None:
            raise LLMError(f"mock mode but no mock_fn for agent={agent}")
        return mock_fn()

    model_id = model or settings.bedrock_model_id
    try:
        resp = _client().converse(
            modelId=model_id,
            system=[{"text": system + "\n\nReturn ONLY valid JSON. No prose, no markdown."}],
            messages=[{"role": "user", "content": [{"text": user}]}],
            inferenceConfig={"maxTokens": max_tokens, "temperature": 0.0},
        )
        text = resp["output"]["message"]["content"][0]["text"]
        return _extract_json(text)
    except Exception as exc:  # graceful fallback keeps the demo alive
        if mock_fn is not None:
            print(f"  [llm-fallback:{agent}] Bedrock error ({type(exc).__name__}: "
                  f"{str(exc)[:120]}) — using deterministic stub")
            return mock_fn()
        raise LLMError(str(exc)) from exc


def complete_text(system: str, user: str, *, model: str | None = None,
                  agent: str = "", mock_fn=None, max_tokens: int = 1024) -> str:
    """Return free-text from the model (sibling of complete_json).

    Falls back to mock_fn() in mock mode or on Bedrock error, so callers always get a string.
    """
    if settings.llm_mode == "mock":
        if mock_fn is None:
            raise LLMError(f"mock mode but no mock_fn for agent={agent}")
        return mock_fn()
    model_id = model or settings.bedrock_model_id
    try:
        resp = _client().converse(
            modelId=model_id,
            system=[{"text": system}],
            messages=[{"role": "user", "content": [{"text": user}]}],
            inferenceConfig={"maxTokens": max_tokens, "temperature": 0.0},
        )
        return resp["output"]["message"]["content"][0]["text"].strip()
    except Exception as exc:
        if mock_fn is not None:
            print(f"  [llm-fallback:{agent}] Bedrock error ({type(exc).__name__}: "
                  f"{str(exc)[:120]}) — using deterministic stub")
            return mock_fn()
        raise LLMError(str(exc)) from exc


def health() -> dict[str, Any]:
    return {"mode": settings.llm_mode, "model": settings.bedrock_model_id,
            "region": settings.aws_region}
