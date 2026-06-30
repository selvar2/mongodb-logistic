"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { Card, SectionTitle, Stat, levelDot } from "@/components/ui";

function fmtTime(s?: string | null) {
  if (!s) return "—";
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

export default function Observability() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try { setD(await api.observability()); }
      catch (e: any) { setErr(`Cannot reach API. (${e.message})`); }
    })();
  }, []);

  if (err) return <div className="card p-4 border-danger/50 bg-danger/10 text-danger text-sm">{err}</div>;
  if (!d) return <div className="text-mutedfg">Loading observability…</div>;

  const ls = d.langsmith || {};
  const a = d.audit || {};
  const lsReachable = ls.configured && ls.reachable !== false;

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="label">Telemetry &amp; Tracing</div>
          <h1 className="text-3xl font-bold">Observability</h1>
          <p className="text-sm text-mutedfg mt-1">LangSmith traces + MongoDB state auditability, in one view.</p>
        </div>
        {(ls.project_url || ls.ui_url) && (
          <a href={ls.project_url || ls.ui_url} target="_blank" rel="noreferrer" className="btn-primary">
            Open in LangSmith ↗
          </a>
        )}
      </div>

      {!lsReachable && (
        <div className="card p-3 border-warn/40 bg-warn/10 text-warn text-sm mb-5">
          LangSmith {ls.configured ? "not reachable" : "not configured"}
          {ls.error ? ` — ${ls.error}` : ""}. Showing MongoDB audit data below.
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Stat label="LangSmith Traces" value={lsReachable ? ls.total_runs : "—"} hint="recent window" tone="info" />
        <Stat label="Success Rate" value={lsReachable && ls.success_rate != null ? `${ls.success_rate}%` : "—"} tone="accent" />
        <Stat label="Avg Latency" value={lsReachable && ls.avg_latency_ms != null ? `${ls.avg_latency_ms}ms` : "—"} />
        <Stat label="Audit Events" value={a.total_events ?? "—"} hint="state auditability" />
        <Stat label="Checkpoints" value={a.checkpoints ?? "—"} hint="thread memory" tone="accent" />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* Recent traces */}
        <Card className="md:col-span-2">
          <SectionTitle kicker={`LangSmith · ${ls.project || ""}`} title="Recent Traces" />
          {lsReachable && (ls.recent?.length ?? 0) > 0 ? (
            <div className="overflow-auto max-h-[420px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr className="text-left text-mutedfg border-b border-border/60">
                    <th className="py-2 pr-3 font-medium">Run</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Latency</th>
                    <th className="py-2 font-medium">Start</th>
                  </tr>
                </thead>
                <tbody>
                  {ls.recent.map((r: any, i: number) => (
                    <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i * 0.02, 0.4) }}
                      className="border-b border-border/30">
                      <td className="py-1.5 pr-3 font-mono text-xs truncate max-w-[220px]">{r.name}</td>
                      <td className="py-1.5 pr-3 text-mutedfg">{r.run_type}</td>
                      <td className="py-1.5 pr-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${r.status === "success" ? "bg-accent" : "bg-danger"}`} />
                          {r.status}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-xs">{r.latency_ms != null ? `${r.latency_ms}ms` : "—"}</td>
                      <td className="py-1.5 text-xs text-mutedfg">{fmtTime(r.start)}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-mutedfg text-sm">No LangSmith traces available.</div>
          )}
          <div className="text-xs text-mutedfg mt-3">Endpoint: {ls.endpoint || "—"}</div>
        </Card>

        {/* Agent activity from audit */}
        <Card>
          <SectionTitle kicker="State Auditability" title="Agent Activity" />
          <div className="space-y-2">
            {Object.entries(a.by_agent || {}).map(([agent, n]: any) => (
              <div key={agent} className="flex items-center justify-between text-sm border-b border-border/30 pb-1.5">
                <span className="text-accent2 font-medium">{agent}</span>
                <span className="font-mono">{n}</span>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <div className="label mb-2">Levels</div>
            <div className="flex gap-3 text-sm">
              {Object.entries(a.by_level || {}).map(([lvl, n]: any) => (
                <span key={lvl} className="inline-flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${levelDot(lvl)}`} />
                  {lvl}: <span className="font-mono">{n}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="card p-3"><div className="label">Plans</div><div className="font-bold text-lg">{a.plans ?? "—"}</div></div>
            <div className="card p-3"><div className="label">Disruptions</div><div className="font-bold text-lg">{a.disruptions ?? "—"}</div></div>
          </div>
        </Card>
      </div>

      <div className="text-xs text-mutedfg mt-4">
        Generated {fmtTime(d.generated_at)} · CloudWatch logs for the AgentCore runtime live in the AWS console.
      </div>
    </div>
  );
}
