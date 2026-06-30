"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import type { WorkflowState, MitigationBrief } from "@/lib/types";
import { Card, SectionTitle, Stat, ActionChip, fmtUSD, fmtNum } from "@/components/ui";
import { EsgPill } from "@/components/SupplierBadge";
import { ConfidenceGauge } from "@/components/ConfidenceGauge";
import { CodeBlock } from "@/components/CopyButton";

const DEMO_ALERT =
  "Typhoon Yagi has closed the Port of Tanjung Pelepas (Malaysia) for 72 hours. Primary supplier SUP-001 (Chang Electronics, Malaysia) has stock but cannot deliver 23 active orders totalling 48,200 units of automotive-grade MCUs and sensor components.";

export default function BriefPage() {
  const [state, setState] = useState<WorkflowState | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setErr(null);
    try {
      const s = await api.runWorkflow({ alert_text: DEMO_ALERT });
      setState(s);
    } catch (e: any) {
      setErr(`Workflow failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  const brief: MitigationBrief | undefined = state?.mitigation_brief;

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="label">Decision support</div>
          <h1 className="text-3xl font-bold">Mitigation Brief</h1>
          <p className="text-sm text-mutedfg mt-1">
            Compliance-vetted recommendation with audit-ready rationale.
          </p>
        </div>
        <button className="btn-primary" onClick={run} disabled={loading}>
          {loading ? "Generating…" : "Generate mitigation brief"}
        </button>
      </div>

      {err && (
        <div className="card p-4 border-danger/50 bg-danger/10 text-danger text-sm mb-6">{err}</div>
      )}

      {loading && (
        <div className="card p-6 text-mutedfg text-sm mb-6 animate-pulse">
          Running graph → vector → RAG → planning agents…
        </div>
      )}

      {brief && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          {/* Header */}
          <Card className="border-accent/30">
            <div className="flex items-center justify-between gap-6 flex-wrap">
              <div>
                <div className="label mb-1">Recommended backup supplier</div>
                <h2 className="text-2xl font-bold">{brief.backup_supplier_name}</h2>
                <div className="text-xs text-mutedfg font-mono mb-3">{brief.backup_supplier}</div>
                <ActionChip action={brief.recommended_action} />
              </div>
              <ConfidenceGauge value={brief.confidence_score} />
            </div>
          </Card>

          {/* Key stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Stat label="Affected Orders" value={fmtNum(brief.affected_orders_count)} tone="warn" />
            <Stat label="Required Capacity" value={fmtNum(brief.required_capacity)} hint="units / month" />
            <Stat
              label="Cost Variance"
              value={fmtUSD(brief.cost_variance_usd)}
              tone={brief.cost_variance_usd > 0 ? "danger" : "accent"}
              hint={`${brief.cost_variance_pct >= 0 ? "+" : ""}${brief.cost_variance_pct.toFixed(1)}%`}
            />
            <Stat
              label="Lead-Time Delta"
              value={`${brief.lead_time_delta_days >= 0 ? "+" : ""}${brief.lead_time_delta_days}d`}
              tone={brief.lead_time_delta_days > 0 ? "warn" : "accent"}
            />
            <Stat label="Reroute Via" value={brief.reroute_via || "—"} tone="info" />
            <Stat label="ESG Status" value={brief.esg_status || "—"} tone="accent" />
          </div>

          {/* Summary */}
          <Card className="border-info/30 bg-info/5">
            <SectionTitle kicker="Executive summary" title="Rationale" />
            <p className="text-sm text-fg/90 leading-relaxed whitespace-pre-line">{brief.summary}</p>
          </Card>

          {/* Options considered */}
          <Card>
            <SectionTitle
              kicker="Vetted alternatives"
              title="Options considered"
              sub="All compliance-passed suppliers, ranked by confidence."
            />
            {brief.options.length === 0 ? (
              <div className="text-mutedfg text-sm">No options recorded.</div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-mutedfg border-b border-border">
                      <th className="py-2 pr-3 font-medium">Supplier</th>
                      <th className="py-2 pr-3 font-medium">Region</th>
                      <th className="py-2 pr-3 font-medium">ESG</th>
                      <th className="py-2 pr-3 font-medium">Capacity/mo</th>
                      <th className="py-2 pr-3 font-medium">Cost %</th>
                      <th className="py-2 pr-3 font-medium">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brief.options.map((o, i) => (
                      <motion.tr
                        key={o.supplier_id}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05, duration: 0.2 }}
                        className="border-b border-border/40 hover:bg-muted/30"
                      >
                        <td className="py-2 pr-3">
                          <div className="font-medium">{o.name}</div>
                          <div className="text-xs text-mutedfg font-mono">{o.supplier_id}</div>
                        </td>
                        <td className="py-2 pr-3">{o.geo_region}</td>
                        <td className="py-2 pr-3"><EsgPill score={o.esg_score} /></td>
                        <td className="py-2 pr-3 font-mono">{fmtNum(o.capacity_units_month)}</td>
                        <td className="py-2 pr-3 font-mono">
                          {o.cost_variance_pct >= 0 ? "+" : ""}
                          {o.cost_variance_pct.toFixed(1)}%
                        </td>
                        <td className="py-2 pr-3 font-mono font-semibold text-accent">
                          {Math.round(o.confidence_score)}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Rejected suppliers */}
          {brief.rejected.length > 0 && (
            <Card className="border-danger/40 bg-danger/5">
              <SectionTitle
                kicker="Compliance vetting"
                title="Rejected suppliers"
                sub="Excluded by policy RAG — proof of audit-grade screening."
              />
              <div className="space-y-3">
                {brief.rejected.map((r, i) => (
                  <motion.div
                    key={r.supplier_id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.2 }}
                    className="border border-danger/30 rounded-lg p-3 bg-danger/5"
                  >
                    <div className="font-mono font-semibold text-danger mb-1">{r.supplier_id}</div>
                    <ul className="list-disc list-inside text-sm text-fg/80 space-y-0.5">
                      {r.reasons.map((reason, j) => (
                        <li key={j}>{reason}</li>
                      ))}
                    </ul>
                  </motion.div>
                ))}
              </div>
            </Card>
          )}

          {/* Raw JSON */}
          <Card>
            <SectionTitle kicker="Machine-readable" title="Brief JSON" sub="Copy for downstream systems or audit log." />
            <CodeBlock code={JSON.stringify(brief, null, 2)} lang="json" />
          </Card>
        </motion.div>
      )}
    </div>
  );
}
