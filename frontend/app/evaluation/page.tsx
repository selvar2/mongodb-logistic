"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { Card, SectionTitle, Stat } from "@/components/ui";

function Bar({ pass, total }: { pass: number; total: number }) {
  const pct = total ? Math.round((100 * pass) / total) : 0;
  const tone = pct === 100 ? "bg-accent" : pct >= 60 ? "bg-warn" : "bg-danger";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <motion.div className={`h-full ${tone}`} initial={{ width: 0 }}
          animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} />
      </div>
      <span className="text-xs font-mono text-mutedfg w-12 text-right">{pass}/{total}</span>
    </div>
  );
}

export default function Evaluation() {
  const [run, setRun] = useState<any>(null);
  const [hist, setHist] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const [l, h] = await Promise.allSettled([api.evalLatest(), api.evalHistory()]);
      if (l.status === "fulfilled") setRun(l.value);
      if (h.status === "fulfilled") setHist(h.value.runs || []);
    } catch {}
  }
  useEffect(() => { load(); }, []);

  async function runEval() {
    setBusy(true); setErr(null);
    try { setRun(await api.evalRun()); await load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  const m = run?.metrics;
  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="label">MongoDB-native · AI Quality</div>
          <h1 className="text-3xl font-bold">Evaluation</h1>
          <p className="text-sm text-mutedfg mt-1">
            Eval dataset + results in MongoDB · deterministic evaluators score the agent graph.
          </p>
        </div>
        <button className="btn-primary" onClick={runEval} disabled={busy}>
          {busy ? "Running…" : "Run Evaluation"}
        </button>
      </div>

      {err && <div className="card p-3 border-danger/50 bg-danger/10 text-danger text-sm mb-5">{err}</div>}
      {!run && <div className="text-mutedfg text-sm">No runs yet — click <b>Run Evaluation</b>.</div>}

      {m && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Stat label="Pass Rate" value={`${m.pass_rate}%`} tone={m.pass_rate === 100 ? "accent" : "warn"} />
            <Stat label="Cases Passed" value={`${m.passed}/${m.total}`} />
            <Stat label="Avg Confidence" value={m.avg_confidence ?? "—"} tone="info" />
            <Stat label="Evaluators" value={Object.keys(m.by_evaluator || {}).length} />
          </div>

          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <Card>
              <SectionTitle kicker="Quality" title="Per-Evaluator Scores" />
              <div className="space-y-3">
                {Object.entries(m.by_evaluator || {}).map(([k, v]: any) => (
                  <div key={k}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-mono text-xs">{k}</span>
                    </div>
                    <Bar pass={v.pass} total={v.total} />
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <SectionTitle kicker="Trend" title="Pass-rate History" />
              {hist.length ? (
                <div className="flex items-end gap-1.5 h-32">
                  {hist.slice().reverse().map((r: any, i: number) => (
                    <motion.div key={i} initial={{ height: 0 }}
                      animate={{ height: `${r.metrics?.pass_rate ?? 0}%` }}
                      transition={{ delay: i * 0.03 }}
                      title={`${r.metrics?.pass_rate}% (${r.run_id})`}
                      className="flex-1 bg-accent/70 rounded-t min-w-[6px]" />
                  ))}
                </div>
              ) : <div className="text-mutedfg text-sm">One run so far.</div>}
              <div className="text-xs text-mutedfg mt-2">{hist.length} run(s) stored in <span className="font-mono">eval_runs</span></div>
            </Card>
          </div>

          <Card>
            <SectionTitle kicker="Detail" title="Per-Case Results" />
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-mutedfg border-b border-border/60">
                    <th className="py-2 pr-3 font-medium">Result</th>
                    <th className="py-2 pr-3 font-medium">Scenario</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Winner</th>
                    <th className="py-2 pr-3 font-medium">Conf</th>
                    <th className="py-2 font-medium">MongoDB AI features</th>
                  </tr>
                </thead>
                <tbody>
                  {run.cases.map((c: any, i: number) => (
                    <motion.tr key={c.case_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.05 }} className="border-b border-border/30 align-top">
                      <td className="py-2 pr-3">
                        <span className={`chip ${c.passed ? "border-accent/50 text-accent bg-accent/10" : "border-danger/50 text-danger bg-danger/10"}`}>
                          {c.passed ? "✓ PASS" : "✗ FAIL"}
                        </span>
                      </td>
                      <td className="py-2 pr-3">{c.name}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{c.status}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{c.winner || "—"}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{c.confidence ?? "—"}</td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-1">
                          {c.mongodb_features.map((f: string) => (
                            <span key={f} className="chip border-border bg-muted/40 text-[10px]">{f}</span>
                          ))}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
