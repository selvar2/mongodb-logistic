"use client";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import type { AuditEntry } from "@/lib/types";
import { Card, SectionTitle, Stat, levelDot } from "@/components/ui";

const LEVELS = ["info", "warn", "error"] as const;
type Level = (typeof LEVELS)[number];

function summaryOf(e: AuditEntry): string {
  return e.output_summary || e.input_summary || "";
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<Set<Level>>(new Set());
  const [agentFilter, setAgentFilter] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.auditLogs();
        setEntries((res.items as AuditEntry[]).slice(0, 200));
      } catch (e: any) {
        setErr(`Cannot load audit logs: ${e.message}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const agents = useMemo(
    () => Array.from(new Set(entries.map((e) => e.agent).filter(Boolean))).sort(),
    [entries],
  );

  const agentCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of entries) m[e.agent] = (m[e.agent] || 0) + 1;
    return m;
  }, [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (levelFilter.size && !levelFilter.has((e.level as Level) ?? "info")) return false;
      if (agentFilter && e.agent !== agentFilter) return false;
      if (q) {
        const hay = `${e.agent} ${e.action} ${summaryOf(e)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, query, levelFilter, agentFilter]);

  function toggleLevel(l: Level) {
    setLevelFilter((prev) => {
      const next = new Set(prev);
      next.has(l) ? next.delete(l) : next.add(l);
      return next;
    });
  }

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <div className="label">Compliance &amp; Governance</div>
        <h1 className="text-3xl font-bold">Audit Logs</h1>
        <p className="text-sm text-mutedfg mt-1">
          Immutable trail of agent decisions — most recent 200 events.
        </p>
      </div>

      {err && (
        <div className="card p-4 border-danger/50 bg-danger/10 text-danger text-sm mb-6">{err}</div>
      )}

      {/* Per-agent counts */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Stat label="Total Events" value={entries.length} />
        {agents.slice(0, 4).map((a) => (
          <Stat key={a} label={a} value={agentCounts[a]} />
        ))}
      </div>

      <Card className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <input
            className="input md:max-w-xs"
            placeholder="Filter by agent or summary…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            {LEVELS.map((l) => {
              const on = levelFilter.has(l);
              return (
                <button
                  key={l}
                  onClick={() => toggleLevel(l)}
                  className={`chip ${on ? "border-accent/60 text-fg bg-accent/10" : "text-mutedfg"}`}
                >
                  <span className={`inline-block w-2 h-2 rounded-full mr-1.5 align-middle ${levelDot(l)}`} />
                  {l}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 md:ml-auto">
            <button
              onClick={() => setAgentFilter(null)}
              className={`chip ${!agentFilter ? "border-accent/60 text-fg bg-accent/10" : "text-mutedfg"}`}
            >
              all agents
            </button>
            {agents.map((a) => (
              <button
                key={a}
                onClick={() => setAgentFilter(a === agentFilter ? null : a)}
                className={`chip ${agentFilter === a ? "border-accent/60 text-fg bg-accent/10" : "text-mutedfg"}`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle kicker="Trail" title={`${filtered.length} events`} />
        {loading ? (
          <div className="text-mutedfg text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-mutedfg text-sm">No matching audit entries.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-mutedfg border-b border-border">
                  <th className="py-2 pr-4 font-medium">Timestamp</th>
                  <th className="py-2 pr-4 font-medium">Agent</th>
                  <th className="py-2 pr-4 font-medium">Action</th>
                  <th className="py-2 pr-4 font-medium">Level</th>
                  <th className="py-2 font-medium">Summary</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, i) => (
                  <motion.tr
                    key={`${e.ts}-${i}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2, delay: Math.min(i * 0.012, 0.4) }}
                    className="border-b border-border/40 hover:bg-surface/50"
                  >
                    <td className="py-2 pr-4 font-mono text-xs text-mutedfg whitespace-nowrap">
                      {e.ts}
                    </td>
                    <td className="py-2 pr-4 text-accent2 font-medium whitespace-nowrap">{e.agent}</td>
                    <td className="py-2 pr-4 text-mutedfg whitespace-nowrap">{e.action}</td>
                    <td className="py-2 pr-4">
                      <span className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${levelDot(e.level)}`} />
                        <span className="text-xs">{e.level}</span>
                      </span>
                    </td>
                    <td className="py-2 text-fg/90">{summaryOf(e)}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
