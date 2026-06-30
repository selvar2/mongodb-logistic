#!/usr/bin/env bash
# ResilioChain — one-command dev runner.
# Starts the FastAPI backend (:8010) and the Next.js frontend (:3000) together.
# Logs: /tmp/resiliochain-backend.log and /tmp/resiliochain-frontend.log
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$REPO_ROOT/backend"
FRONTEND="$REPO_ROOT/frontend"
BACKEND_PORT="${BACKEND_PORT:-8010}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
API_BASE="${NEXT_PUBLIC_API_BASE:-http://localhost:${BACKEND_PORT}}"

log() { printf '\033[1;35m[dev]\033[0m %s\n' "$*"; }

if [ ! -x "$BACKEND/.venv/bin/uvicorn" ]; then
  log "Backend deps missing — running setup first."
  bash "$REPO_ROOT/.devcontainer/setup.sh"
fi

cleanup() {
  log "Shutting down..."
  [ -n "${BE_PID:-}" ] && kill "$BE_PID" 2>/dev/null
  [ -n "${FE_PID:-}" ] && kill "$FE_PID" 2>/dev/null
}
trap cleanup EXIT INT TERM

log "Starting backend on :${BACKEND_PORT}"
( cd "$BACKEND" && exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port "$BACKEND_PORT" ) \
  > /tmp/resiliochain-backend.log 2>&1 &
BE_PID=$!

log "Starting frontend on :${FRONTEND_PORT} (API_BASE=${API_BASE})"
( cd "$FRONTEND" && NEXT_PUBLIC_API_BASE="$API_BASE" exec npm run dev -- --port "$FRONTEND_PORT" ) \
  > /tmp/resiliochain-frontend.log 2>&1 &
FE_PID=$!

log "Backend  -> http://localhost:${BACKEND_PORT}  (docs: /docs, health: /health)"
log "Frontend -> http://localhost:${FRONTEND_PORT}"
log "Tailing logs (Ctrl-C to stop both)..."
wait
