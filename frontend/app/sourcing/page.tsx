"use client";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import type { WorkflowState, PlanOption, ComplianceResult } from "@/lib/types";
import { Card, SectionTitle, Stat, fmtUSD, fmtNum } from "@/components/ui";
import { SupplierBadge, EsgPill } from "@/components/SupplierBadge";
import { CodeBlock } from "@/components/CopyButton";

const DEMO_ALERT =
  "Typhoon Yagi has closed the Port of Tanjung Pelepas (Malaysia) for 72 hours. Primary supplier SUP-001 (Chang Electronics, Malaysia) has stock but cannot deliver 23 active orders totalling 48,200 units of automotive-grade MCUs and sensor components.";

const PIPELINE = `// Semantic sourcing — MongoDB Atlas $vectorSearch
// Voyage autoEmbed turns the disruption profile into a query vector
db.suppliers.aggregate([
  {
    $vectorSearch: {
      index: "suppliers_vs",
      path: "embed_text",          // Voyage autoEmbed field
      query: disruptionProfileText, // skus + capabilities needed
      numCandidates: 200,
      limit: 10,
      filter: {
        capacity_units_month: { $gte: requiredCapacity }, // hard filter
        supplier_id: { $ne: disruptedSupplierId },        // exclude disrupted
        geo_region:  { $ne: disruptedRegion }             // exclude region
      }
    }
  },
  { $set: { similarity_score: { $meta: "vectorSearchScore" } } },
  { $project: {
      supplier_id: 1, name: 1, geo_region: 1, esg_score: 1,
      lead_time_days: 1, capacity_units_month: 1, unit_price: 1,
      similarity_score: 1
  } }
])`;

export default function SourcingPage() {
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

  const candidates = state?.candidate_suppliers ?? [];
  const compliance = state?.compliance_results ?? [];

  // Map supplier_id -> compliance verdict for badge classification.
  const verdict = useMemo(() => {
    const m = new Map<string, ComplianceResult>();
    compliance.forEach((c) => m.set(c.supplier_id, c));
    return m;
  }, [compliance]);

  function badgeKind(c: PlanOption, rank: number) {
    const v = verdict.get(c.supplier_id);
    if (v && !v.passed) return "COMPLIANCE_BLOCKED" as const;
    if (v && v.passed) return rank === 0 ? ("GOOD" as const) : ("ALTERNATIVE" as const);
    return "NEUTRAL" as const;
  }

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="label">Vector RAG · Atlas $vectorSearch</div>
          <h1 className="text-3xl font-bold">Alternative Supplier Search</h1>
          <p className="text-sm text-mutedfg mt-1">
            Semantic recall over the supplier graph, hard-filtered on capacity and geography.
          </p>
        </div>
        <button className="btn-primary" onClick={run} disabled={loading}>
          {loading ? "Searching…" : "Run semantic sourcing"}
        </button>
      </div>

      {err && (
        <div className="card p-4 border-danger/50 bg-danger/10 text-danger text-sm mb-6">{err}</div>
      )}

      <Card className="mb-6">
        <SectionTitle
          kicker="How it works"
          title="$vectorSearch pipeline"
          sub="Voyage autoEmbed builds the query vector; a hard filter guarantees feasible, non-disrupted alternatives."
        />
        <CodeBlock code={PIPELINE} lang="mongodb aggregation" />
      </Card>

      {loading && (
        <div className="card p-6 text-mutedfg text-sm mb-6 animate-pulse">
          Embedding disruption profile and recalling candidate suppliers…
        </div>
      )}

      {state && !loading && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Stat label="Candidates Found" value={candidates.length} hint="post-filter recall" />
            <Stat
              label="Vetted (passed)"
              value={compliance.filter((c) => c.passed).length}
              tone="accent"
            />
            <Stat
              label="Blocked"
              value={compliance.filter((c) => !c.passed).length}
              tone="danger"
            />
            <Stat label="Required Capacity" value={fmtNum(state.required_capacity)} hint="units / month" />
          </div>

          <Card>
            <SectionTitle
              kicker="Ranked recall"
              title="Candidate suppliers"
              sub="Ordered by semantic similarity; compliance verdict shown per row."
            />
            {candidates.length === 0 ? (
              <div className="text-mutedfg text-sm">No candidates returned.</div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-mutedfg border-b border-border">
                      <th className="py-2 pr-3 font-medium">#</th>
                      <th className="py-2 pr-3 font-medium">Supplier</th>
                      <th className="py-2 pr-3 font-medium">Region</th>
                      <th className="py-2 pr-3 font-medium">Capacity/mo</th>
                      <th className="py-2 pr-3 font-medium">ESG</th>
                      <th className="py-2 pr-3 font-medium">Lead</th>
                      <th className="py-2 pr-3 font-medium">Unit Price</th>
                      <th className="py-2 pr-3 font-medium">Similarity</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((c, i) => {
                      const sim = (c as any).similarity_score as number | undefined;
                      return (
                        <motion.tr
                          key={c.supplier_id}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05, duration: 0.2 }}
                          className="border-b border-border/40 hover:bg-muted/30"
                        >
                          <td className="py-2 pr-3 font-mono text-mutedfg">{i + 1}</td>
                          <td className="py-2 pr-3">
                            <div className="font-medium">{c.name}</div>
                            <div className="text-xs text-mutedfg font-mono">{c.supplier_id}</div>
                          </td>
                          <td className="py-2 pr-3">{c.geo_region}</td>
                          <td className="py-2 pr-3 font-mono">{fmtNum(c.capacity_units_month)}</td>
                          <td className="py-2 pr-3"><EsgPill score={c.esg_score} /></td>
                          <td className="py-2 pr-3">{c.lead_time_days}d</td>
                          <td className="py-2 pr-3 font-mono">{fmtUSD(c.unit_price)}</td>
                          <td className="py-2 pr-3 font-mono">
                            {sim != null ? sim.toFixed(3) : "—"}
                          </td>
                          <td className="py-2 pr-3"><SupplierBadge kind={badgeKind(c, i)} /></td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </motion.div>
      )}
    </div>
  );
}
