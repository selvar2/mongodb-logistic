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


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "internal_error", "message": str(exc)[:300]}},
    )


@app.get("/", tags=["root"])
def root() -> dict:
    return {"service": "resiliochain-api", "docs": "/docs", "health": "/health"}
