"""Centralized configuration loaded from the repo-root .env file.

All env access goes through `settings` so the rest of the app never reads
os.environ directly. Secrets live only in .env (gitignored).
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

# repo root = two levels up from this file (backend/app/config.py -> repo root)
REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")


def _get(key: str, default: str = "") -> str:
    return os.environ.get(key, default).strip().strip('"')


class Settings:
    # MongoDB
    mongodb_uri: str = _get("MONGODB_URI")
    mongodb_db: str = _get("MONGODB_DB", "resiliochain")

    # AWS Bedrock
    aws_access_key_id: str = _get("AWS_ACCESS_KEY_ID")
    aws_secret_access_key: str = _get("AWS_SECRET_ACCESS_KEY")
    aws_region: str = _get("AWS_REGION", "us-east-1")
    # bedrock_model_id is the default/worker model (Haiku). The Supervisor and
    # Mitigation Planner do complex multi-step reasoning and use a stronger Sonnet
    # model; the three worker agents (impact/sourcing/compliance) use the Haiku
    # default. See ai-agent-req-event.pdf for the per-agent model assignment.
    bedrock_model_id: str = _get("BEDROCK_MODEL_ID")
    bedrock_model_supervisor: str = _get("BEDROCK_MODEL_SUPERVISOR") or _get("BEDROCK_MODEL_ID")
    bedrock_model_planner: str = _get("BEDROCK_MODEL_PLANNER") or _get("BEDROCK_MODEL_ID")
    bedrock_model_impact: str = _get("BEDROCK_MODEL_IMPACT") or _get("BEDROCK_MODEL_ID")
    bedrock_model_sourcing: str = _get("BEDROCK_MODEL_SOURCING") or _get("BEDROCK_MODEL_ID")
    bedrock_model_compliance: str = _get("BEDROCK_MODEL_COMPLIANCE") or _get("BEDROCK_MODEL_ID")

    # LLM behavior
    llm_mode: str = _get("LLM_MODE", "bedrock").lower()  # bedrock | mock

    # Embeddings
    embedding_mode: str = _get("EMBEDDING_MODE", "autoembed").lower()  # autoembed | explicit
    voyage_api_key: str = _get("VOYAGE_API_KEY")
    voyage_model: str = _get("VOYAGE_MODEL", "voyage-3")

    # LangSmith observability
    langchain_tracing: str = _get("LANGCHAIN_TRACING_V2", "false").lower()
    langchain_endpoint: str = _get("LANGCHAIN_ENDPOINT", "https://api.smith.langchain.com")
    langchain_api_key: str = _get("LANGCHAIN_API_KEY")
    langchain_project: str = _get("LANGCHAIN_PROJECT", "resiliochain")

    # App
    api_host: str = _get("API_HOST", "0.0.0.0")
    api_port: int = int(_get("API_PORT", "8000") or "8000")
    confidence_auto_threshold: int = int(_get("CONFIDENCE_AUTO_THRESHOLD", "85") or "85")
    compliance_max_retries: int = int(_get("COMPLIANCE_MAX_RETRIES", "3") or "3")

    # Collection names (single source of truth)
    COL_ORDERS = "orders"
    COL_SUPPLIERS = "suppliers"
    COL_POLICIES = "compliance_policies"
    COL_CHECKPOINTS = "agent_checkpoints"
    COL_PLANS = "mitigation_plans"
    COL_AUDIT = "audit_logs"
    COL_DISRUPTIONS = "disruptions"

    # Atlas Vector Search index names
    IDX_SUPPLIER_VECTOR = "supplier_vector_index"
    IDX_POLICY_VECTOR = "policy_vector_index"

    def masked_uri(self) -> str:
        """URI with the password redacted — safe for logs."""
        uri = self.mongodb_uri
        if "@" in uri and "://" in uri:
            scheme, rest = uri.split("://", 1)
            creds, host = rest.split("@", 1)
            user = creds.split(":", 1)[0]
            return f"{scheme}://{user}:****@{host}"
        return uri


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
