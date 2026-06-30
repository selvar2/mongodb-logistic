"""ResilioChain FastAPI application entrypoint.

Run:  uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import charts, data, disruptions, evaluation, graphrag, health, observability, workflow

app = FastAPI(
    title="ResilioChain API",
    version="1.0.0",
    description="Agentic supply-chain disruption response — MongoDB Atlas + LangGraph + Bedrock.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    # Allow GitHub Codespaces forwarded frontend origins, e.g.
    # https://<name>-3000.app.github.dev (and other *.github.dev preview hosts).
    allow_origin_regex=r"https://.*\.(app\.github\.dev|githubpreview\.dev)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(disruptions.router)
app.include_router(workflow.router)
app.include_router(data.router)
app.include_router(observability.router)
app.include_router(graphrag.router)
app.include_router(evaluation.router)
app.include_router(charts.router)


@app.on_event("startup")
def _warmup_bedrock() -> None:
    """Fire a tiny Bedrock call in the background so the first real workflow does
    not pay the model cold-start latency (~60s observed), which otherwise blows
    past the SSE stream timeout and shows an empty brief."""
    from app.config import settings
    if settings.llm_mode == "mock":
        return
    import threading

    def _go() -> None:
        try:
            from app.llm import bedrock
            bedrock.complete_text("You are a warmup probe.", "Reply with: ok",
                                  max_tokens=5)
            print("[warmup] Bedrock warmed up.")
        except Exception as exc:  # never block startup on warmup
            print(f"[warmup] Bedrock warmup skipped: {exc}")

    threading.Thread(target=_go, daemon=True).start()


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "internal_error", "message": str(exc)[:300]}},
    )


@app.get("/", tags=["root"])
def root() -> dict:
    return {"service": "resiliochain-api", "docs": "/docs", "health": "/health"}
