# RUN_APP — How to run ResilioChain (and never hit the "Cannot reach API" bug again)

> One page that tells you exactly how to start the app, what is already
> installed, which scripts run automatically, and the **one mistake** that
> breaks the dashboard in Codespaces.

---

## TL;DR — the only command you need

```bash
bash scripts/dev.sh
```

Starts the FastAPI backend on **:8010** and the Next.js frontend on **:3000**
together, streams both logs, and stops both on `Ctrl-C`. Dependencies are
already installed (see below), so this just runs — no setup step required.

Then open the **forwarded :3000 URL** from the VS Code **PORTS** tab (or the
auto-opened preview). Do **not** type `localhost:3000` into a browser on your
own machine — in Codespaces the app runs in the container, not on your laptop.

---

## ⚠️ The #1 gotcha: never pin `NEXT_PUBLIC_API_BASE` to localhost

The dashboard error

> **Cannot reach API at http://localhost:8010. Is the backend running? (Failed to fetch)**

is almost always caused by starting the frontend like this:

```bash
# ❌ WRONG in Codespaces — pins the API to a host the BROWSER can't reach
NEXT_PUBLIC_API_BASE=http://localhost:8010 npm run dev
```

### Why it breaks

The fetch runs **in your browser**, on your machine — not in the container.
`localhost:8010` from the browser points at *your laptop*, where nothing is
listening. The backend is reachable only via its **forwarded** Codespaces host
(`https://<codespace>-8010.app.github.dev`).

The frontend already knows how to figure this out on its own. See
[`frontend/lib/api.ts`](frontend/lib/api.ts):

```ts
function resolveApiBase(): string {
  const explicit = process.env.NEXT_PUBLIC_API_BASE;
  if (explicit) return explicit;                 // an explicit value ALWAYS wins
  if (typeof window !== "undefined") {
    const { hostname, protocol } = window.location;
    const m = hostname.match(/^(.*)-3000\.(.+)$/); // <name>-3000.app.github.dev
    if (m) return `${protocol}//${m[1]}-8010.${m[2]}`; // -> <name>-8010.app.github.dev
  }
  return "http://localhost:8010";                // local dev + in-container SSR
}
```

So: **leave `NEXT_PUBLIC_API_BASE` unset in Codespaces.** The browser then
derives `…-8010.app.github.dev` automatically. Set it explicitly *only* when you
deliberately want to pin the backend to a fixed host (e.g. a deployed API).

### Correct ways to run the frontend

```bash
bash scripts/dev.sh          # ✅ recommended — leaves the var unset for you
# or, manually:
cd frontend && npm run dev   # ✅ also fine — var unset, browser auto-detects
```

> CORS is already configured for this: the backend allows
> `https://*.app.github.dev` (see [`backend/app/main.py`](backend/app/main.py)),
> and port **8010** is forwarded by the devcontainer.

---

## What's already installed (don't reinstall)

| Component | Where | Installed by |
|---|---|---|
| Backend Python venv + deps (FastAPI, LangGraph, PyMongo, boto3…) | `backend/.venv/` | `.devcontainer/setup.sh` |
| Frontend npm deps (Next.js 14, React, Tailwind, Framer Motion…) | `frontend/node_modules/` | `.devcontainer/setup.sh` |

Dependencies live on the persistent `/workspaces` volume, so a relaunched
Codespace **does not** reinstall from scratch.

- Backend deps: `backend/requirements.txt`
- Frontend deps: `frontend/package.json` + `frontend/package-lock.json`
- Runtimes: Python 3.11+ and Node 20 (pinned in `.devcontainer/devcontainer.json`)

If something is genuinely missing, the runner and poststart hook reinstall it
for you — you should never need to run pip/npm by hand.

---

## The lifecycle scripts (run automatically)

These are wired up in [`.devcontainer/devcontainer.json`](.devcontainer/devcontainer.json):

### 1. Prebuild / first create — `onCreateCommand`
[`.devcontainer/setup.sh`](.devcontainer/setup.sh) — runs once when the container
is created (and during Codespaces **prebuilds**). Idempotent:

- Creates `backend/.venv` and `pip install -r requirements.txt`.
  Skips the install if `requirements.txt` is unchanged (sha256 stamp at
  `.venv/.deps-installed`).
- Runs `npm ci` in `frontend/` (falls back to `npm install`).
  Skips if `package-lock.json` is unchanged (stamp at `node_modules/.lock-hash`).
- Warns if `.env` is missing at the repo root.

### 2. Every start — `postStartCommand`
[`.devcontainer/poststart.sh`](.devcontainer/poststart.sh) — runs on **every**
Codespace start. Near-instant when deps are already present; only re-invokes
`setup.sh` if the venv or `node_modules` is missing. Ends by printing:

```
Ready. Start the stack with:  bash scripts/dev.sh
```

### 3. Run the app — `scripts/dev.sh`
[`scripts/dev.sh`](scripts/dev.sh) — the one-command dev runner. It:

- runs `setup.sh` first **only if** `backend/.venv/bin/uvicorn` is missing;
- starts backend: `uvicorn app.main:app --host 0.0.0.0 --port 8010`;
- starts frontend: `npm run dev -- --port 3000` with
  **`NEXT_PUBLIC_API_BASE` left unset** (auto-detect);
- logs to `/tmp/resiliochain-backend.log` and `/tmp/resiliochain-frontend.log`;
- traps `Ctrl-C` to stop both.

Override ports or pin the API host via env vars if you must:

```bash
BACKEND_PORT=8010 FRONTEND_PORT=3000 bash scripts/dev.sh
NEXT_PUBLIC_API_BASE=https://api.example.com bash scripts/dev.sh   # pin on purpose
```

---

## First-time prerequisite: `.env`

Secrets are **not** committed. Create the repo-root `.env` once:

```bash
cp .env.example .env
# then fill: MONGODB_URI, MONGODB_DB, AWS creds + AWS_REGION, LLM_MODE
```

- `LLM_MODE=bedrock` → real AWS Bedrock (Claude Haiku 4.5). Needs AWS creds.
- `LLM_MODE=mock` → runs the whole graph offline, no credentials needed
  (good for a demo without network/keys).

The backend loads `.env` from the repo root automatically
([`backend/app/config.py`](backend/app/config.py)).

---

## Verify it's actually up

```bash
# Backend (inside the container)
curl -s http://localhost:8010/health
# -> {"status":"ok","mongo":{"connected":true},"llm":{"mode":"bedrock",...}}

# Backend via the forwarded host (what the BROWSER uses)
curl -s "https://${CODESPACE_NAME}-8010.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}/health"
# -> HTTP 200

# Frontend
curl -s http://localhost:3000/ | grep -o '<title>[^<]*</title>'
# -> <title>ResilioChain — Supply-Chain Disruption AI</title>
```

Then open the dashboard, go to **/workflow** → "Run Demo Workflow" for the live
agent SSE stream, or **/brief** to generate a mitigation brief.

---

## Quick troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Cannot reach API at http://localhost:8010" in the browser | Frontend was started with `NEXT_PUBLIC_API_BASE=http://localhost:8010` | Restart with `bash scripts/dev.sh` (var unset), then **hard-refresh** the tab (Cmd/Ctrl+Shift+R) — the old bundle had localhost baked in |
| Port 8010 not reachable from browser | Port not forwarded / set to Private | Forward **8010** in the PORTS tab; it's in `devcontainer.json forwardPorts` |
| Backend won't start, Mongo errors | `.env` missing or wrong `MONGODB_URI` | `cp .env.example .env` and fill it; or set `LLM_MODE=mock` for offline |
| Frontend shows stale API host after fixing | Browser cached the old JS bundle | Hard-refresh (Cmd/Ctrl+Shift+R) |
| `uvicorn: command not found` | venv not installed | `bash .devcontainer/setup.sh` |

---

_Companion file: **RUN_APP.html** — the same guide as a standalone, styled page
you can open directly in a browser._
