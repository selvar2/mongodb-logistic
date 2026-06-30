#!/usr/bin/env bash
# ResilioChain — first-time / prebuild install (idempotent).
# Runs on container creation (onCreateCommand) and is reused by poststart.sh.
# Installs into the persistent /workspaces volume so a relaunched Codespace
# does NOT reinstall from scratch — it only installs what is missing or changed.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$REPO_ROOT/backend"
FRONTEND="$REPO_ROOT/frontend"
VENV="$BACKEND/.venv"

log() { printf '\033[1;36m[setup]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[setup:warn]\033[0m %s\n' "$*"; }

# ----------------------------------------------------------------------------
# Backend: Python venv + pip deps (skip if requirements.txt unchanged)
# ----------------------------------------------------------------------------
install_backend() {
  log "Backend: checking Python virtualenv at $VENV"
  if [ ! -x "$VENV/bin/python" ]; then
    log "Creating virtualenv (python3)"
    python3 -m venv "$VENV" || { warn "venv creation failed"; return 1; }
  fi

  local req="$BACKEND/requirements.txt"
  local stamp="$VENV/.deps-installed"
  local cur_hash
  cur_hash="$(sha256sum "$req" | awk '{print $1}')"

  if [ -f "$stamp" ] && [ "$(cat "$stamp" 2>/dev/null)" = "$cur_hash" ]; then
    log "Backend deps already up to date (requirements.txt unchanged) — skipping pip install"
    return 0
  fi

  log "Installing backend deps from requirements.txt"
  "$VENV/bin/python" -m pip install --upgrade pip >/dev/null 2>&1 || warn "pip self-upgrade failed (continuing)"
  if "$VENV/bin/pip" install -r "$req"; then
    echo "$cur_hash" > "$stamp"
    log "Backend deps installed."
  else
    warn "Backend pip install reported errors — check output above."
    return 1
  fi
}

# ----------------------------------------------------------------------------
# Frontend: npm deps (skip if node_modules present and lockfile unchanged)
# ----------------------------------------------------------------------------
install_frontend() {
  log "Frontend: checking node_modules"
  local lock="$FRONTEND/package-lock.json"
  local stamp="$FRONTEND/node_modules/.lock-hash"
  local cur_hash=""
  [ -f "$lock" ] && cur_hash="$(sha256sum "$lock" | awk '{print $1}')"

  if [ -d "$FRONTEND/node_modules" ] && [ -n "$cur_hash" ] && \
     [ "$(cat "$stamp" 2>/dev/null)" = "$cur_hash" ]; then
    log "Frontend deps already up to date (package-lock.json unchanged) — skipping npm install"
    return 0
  fi

  pushd "$FRONTEND" >/dev/null || return 1
  if [ -f package-lock.json ]; then
    log "Running npm ci"
    npm ci || { warn "npm ci failed, falling back to npm install"; npm install; }
  else
    log "No lockfile — running npm install"
    npm install
  fi
  local rc=$?
  [ -n "$cur_hash" ] && [ -d node_modules ] && echo "$cur_hash" > node_modules/.lock-hash
  popd >/dev/null
  [ $rc -eq 0 ] && log "Frontend deps installed." || warn "Frontend install reported errors."
  return $rc
}

log "ResilioChain setup starting (repo: $REPO_ROOT)"
install_backend || warn "Backend setup incomplete."
install_frontend || warn "Frontend setup incomplete."
log "Setup complete."
if [ ! -f "$REPO_ROOT/.env" ]; then
  warn ".env not found at repo root — copy .env.example to .env and fill MONGODB_URI + AWS creds before running."
fi
