#!/usr/bin/env bash
# ResilioChain — runs on EVERY Codespace start (postStartCommand).
# Fast + idempotent: dependencies live on the persistent /workspaces volume, so
# a warm relaunch is a near-instant no-op. Only installs what is actually missing.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$REPO_ROOT/backend"
FRONTEND="$REPO_ROOT/frontend"

log() { printf '\033[1;32m[poststart]\033[0m %s\n' "$*"; }

need_install=0
if [ ! -x "$BACKEND/.venv/bin/python" ]; then
  log "Backend venv missing — installing."
  need_install=1
else
  log "Backend deps present (.venv) — picked up, no reinstall."
fi

if [ ! -d "$FRONTEND/node_modules" ]; then
  log "Frontend node_modules missing — installing."
  need_install=1
else
  log "Frontend deps present (node_modules) — picked up, no reinstall."
fi

if [ "$need_install" -eq 1 ]; then
  bash "$REPO_ROOT/.devcontainer/setup.sh"
fi

log "Ready. Start the stack with:  bash scripts/dev.sh"
