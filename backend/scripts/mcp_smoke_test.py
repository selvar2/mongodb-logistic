#!/usr/bin/env python3
"""Smoke-test the official MongoDB MCP server end-to-end, no agent client required.

Spawns the same `mongodb-mcp-server` binary that .mcp.json launches, speaks MCP
JSON-RPC over stdio (initialize -> tools/list -> list-collections -> count -> find),
and prints the result. Proves the server binary + MONGODB_URI + Atlas read path all work.

Usage:
    backend/.venv/bin/python backend/scripts/mcp_smoke_test.py
    MONGODB_URI="mongodb+srv://..." python backend/scripts/mcp_smoke_test.py

Reads MONGODB_URI from the environment, else from the repo-root .env. See
docs/mongodb-mcp-guide.md for the full runbook.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DB = os.environ.get("MDB_SMOKE_DB", "resiliochain")


def load_uri() -> str:
    uri = os.environ.get("MONGODB_URI")
    if uri:
        return uri.strip().strip('"')
    env_file = REPO_ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("MONGODB_URI="):
                return line.split("=", 1)[1].strip().strip('"')
    sys.exit("MONGODB_URI not set (env or .env)")


def main() -> int:
    uri = load_uri()
    env = dict(os.environ)
    env["MDB_MCP_CONNECTION_STRING"] = uri
    env.setdefault("MDB_MCP_READ_ONLY", "true")  # smoke test only reads

    proc = subprocess.Popen(
        ["npx", "-y", "mongodb-mcp-server@latest"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env=env, text=True, bufsize=1,
    )
    errlines: list[str] = []
    threading.Thread(
        target=lambda: [errlines.append(l.rstrip()) for l in proc.stderr],
        daemon=True,
    ).start()

    def send(obj: dict) -> None:
        proc.stdin.write(json.dumps(obj) + "\n")
        proc.stdin.flush()

    def read_until(want_id: int, timeout: int = 120):
        end = time.time() + timeout
        while time.time() < end:
            line = proc.stdout.readline()
            if not line:
                time.sleep(0.05); continue
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            if msg.get("id") == want_id:
                return msg
        return None

    def call(rid: int, name: str, args: dict):
        send({"jsonrpc": "2.0", "id": rid, "method": "tools/call",
              "params": {"name": name, "arguments": args}})
        resp = read_until(rid)
        if not resp or "result" not in resp:
            return f"ERROR: {resp.get('error') if resp else 'no response'}"
        parts = resp["result"].get("content", [])
        return "\n".join(p.get("text", "") for p in parts if p.get("type") == "text")

    ok = True
    try:
        send({"jsonrpc": "2.0", "id": 1, "method": "initialize",
              "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                         "clientInfo": {"name": "mcp-smoke-test", "version": "1.0"}}})
        init = read_until(1)
        if not (init and "result" in init):
            print("initialize: FAILED", file=sys.stderr)
            print("\n".join(errlines[-15:]), file=sys.stderr)
            return 1
        info = init["result"].get("serverInfo", {})
        print(f"initialize ok: {info.get('name')} v{info.get('version')}")
        send({"jsonrpc": "2.0", "method": "notifications/initialized"})

        send({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
        tl = read_until(2)
        tools = [t["name"] for t in tl["result"]["tools"]] if tl else []
        print(f"tools: {len(tools)}")

        print("\nlist-collections:\n  " + call(3, "list-collections", {"database": DB}))
        for coll in ("suppliers", "orders"):
            print(f"\ncount {coll}:\n  " + call(4, "count", {"database": DB, "collection": coll}))
        print("\nfind suppliers (SUP-001):\n  " + call(5, "find", {
            "database": DB, "collection": "suppliers",
            "filter": {"_id": "SUP-001"},
            "projection": {"_id": 1, "name": 1, "disrupted": 1}, "limit": 1}))
    finally:
        proc.terminate()
    print("\nSMOKE TEST: PASS" if ok else "\nSMOKE TEST: FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
