"""AWS Bedrock AgentCore Runtime entrypoint for ResilioChain.

Wraps the LangGraph multi-agent workflow (`app.agents.graph.run_workflow`) so it can
be hosted on Bedrock AgentCore Runtime. The container runs this module; AgentCore
invokes `invoke(payload)` per request.

Runtime configuration is supplied via environment variables (set at launch):
  MONGODB_URI, MONGODB_DB, BEDROCK_MODEL_ID, EMBEDDING_MODE, LLM_MODE
AWS credentials are NOT passed as env vars — boto3 uses the AgentCore execution role
(which is granted bedrock:InvokeModel), so leave AWS_ACCESS_KEY_ID unset in the runtime.

Local test:
  python agentcore_app.py            # runs app.run() (AgentCore dev server on :8080)
"""
from __future__ import annotations

from bedrock_agentcore import BedrockAgentCoreApp

from app.agents.graph import DEMO_ALERT, run_workflow

app = BedrockAgentCoreApp()


@app.entrypoint
def invoke(payload: dict) -> dict:
    """Run the disruption-response workflow.

    payload: {"alert_text": "<disruption description>"}  (falls back to the demo alert)
    returns: a compact, JSON-serializable summary of the mitigation decision.
    """
    alert = (payload or {}).get("alert_text") or (payload or {}).get("prompt") or DEMO_ALERT
    final = run_workflow(alert)
    brief = final.get("mitigation_brief", {}) or {}
    return {
        "status": final.get("status"),
        "severity": final.get("severity"),
        "disrupted_supplier": final.get("affected_supplier_id"),
        "impacted_orders": len(final.get("impacted_orders", [])),
        "required_capacity": final.get("required_capacity"),
        "recommended_supplier": brief.get("backup_supplier"),
        "recommended_supplier_name": brief.get("backup_supplier_name"),
        "confidence_score": final.get("confidence_score"),
        "recommended_action": final.get("recommended_action"),
        "cost_variance_usd": brief.get("cost_variance_usd"),
        "rejected": [r.get("supplier_id") for r in final.get("compliance_results", [])
                     if not r.get("passed")],
        "summary": brief.get("summary"),
        "thread_id": final.get("thread_id"),
    }


if __name__ == "__main__":
    app.run()
