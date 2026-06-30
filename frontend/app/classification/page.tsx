"use client";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import type { Supplier } from "@/lib/types";
import { Stat, fmtNum } from "@/components/ui";
import { SupplierBadge, EsgPill, type SupplierClass } from "@/components/SupplierBadge";

type Classified = { kind: SupplierClass; reason: string };

function classify(s: Supplier): Classified {
  if (s.disrupted) {
    return { kind: "IMPACTED", reason: "Has stock but delivery blocked by the disruption" };
  }
  if (s.esg_score < 60) {
    return { kind: "COMPLIANCE_BLOCKED", reason: `ESG score ${s.esg_score} below required minimum 60` };
  }
  if (s.geo_region === "Malaysia") {
    return { kind: "RISKY", reason: "Located in the disrupted region" };
  }
  if (s.esg_score >= 80 && s.capacity_units_month >= 48200) {
    return { kind: "GOOD", reason: "Compliant, high ESG, sufficient capacity" };
  }
  return { kind: "ALTERNATIVE", reason: "Compliant backup option" };
}

const FILTERS: { kind: SupplierClass | "ALL"; label: string }[] = [
  { kind: "ALL", label: "All" },
  { kind: "IMPACTED", label: "Impacted" },
  { kind: "RISKY", label: "Risky" },
  { kind: "COMPLIANCE_BLOCKED", label: "Compliance-Blocked" },
  { kind: "GOOD", label: "Good / Available" },
  { kind: "ALTERNATIVE", label: "Alternative" },
];

export default function ClassificationPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<SupplierClass | "ALL">("ALL");

  useEffect(() => {
    (async () => {
      try {
        const s = await api.suppliers();
        setSuppliers(s.items as Supplier[]);
      } catch (e: any) {
        setErr(`Cannot reach API. Is the backend running? (${e.message})`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const rows = useMemo(
    () => suppliers.map((s) => ({ s, c: classify(s) })),
    [suppliers],
  );

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    rows.forEach((r) => { m[r.c.kind] = (m[r.c.kind] || 0) + 1; });
    return m;
  }, [rows]);

  const visible = filter === "ALL" ? rows : rows.filter((r) => r.c.kind === filter);

  return (
    <div className="max-w-7xl">
      <div className="mb-6">
        <div className="label">Triage</div>
        <h1 className="text-3xl font-bold">Supplier Impact Classification</h1>
        <p className="text-sm text-mutedfg mt-1">
          Deterministic classification of every supplier against the active disruption and compliance policy.
        </p>
      </div>

      {err && (
        <div className="card p-4 border-danger/50 bg-danger/10 text-danger text-sm mb-6">{err}</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Stat label="Total Suppliers" value={suppliers.length} />
        <Stat label="Impacted" value={counts.IMPACTED || 0} tone="danger" />
        <Stat label="Risky" value={counts.RISKY || 0} tone="warn" />
        <Stat label="Good / Available" value={counts.GOOD || 0} tone="accent" />
        <Stat label="Compliance-Blocked" value={counts.COMPLIANCE_BLOCKED || 0} tone="danger" />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((f) => {
          const active = filter === f.kind;
          const n = f.kind === "ALL" ? rows.length : (counts[f.kind] || 0);
          return (
            <button
              key={f.kind}
              onClick={() => setFilter(f.kind)}
              className={`chip transition-colors ${active ? "border-accent/60 text-accent bg-accent/10" : "border-border text-mutedfg hover:text-fg"}`}
            >
              {f.label} <span className="opacity-60">({n})</span>
            </button>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
        className="card p-0 overflow-hidden"
      >
        <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-surface2 text-mutedfg">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium">Supplier</th>
                <th className="px-4 py-3 font-medium">Region</th>
                <th className="px-4 py-3 font-medium">Capabilities</th>
                <th className="px-4 py-3 font-medium text-right">Capacity</th>
                <th className="px-4 py-3 font-medium text-right">ESG</th>
                <th className="px-4 py-3 font-medium">Classification</th>
                <th className="px-4 py-3 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-mutedfg">Loading suppliers…</td></tr>
              )}
              {!loading && visible.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-mutedfg">No suppliers match this filter.</td></tr>
              )}
              {visible.map(({ s, c }, i) => (
                <motion.tr
                  key={s._id}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.3) }}
                  className="border-t border-border/40 hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-mutedfg font-mono">{s._id}</div>
                  </td>
                  <td className="px-4 py-3 text-mutedfg">{s.geo_region}</td>
                  <td className="px-4 py-3 max-w-[220px] truncate text-mutedfg" title={(s.capabilities || []).join(", ")}>
                    {(s.capabilities || []).join(", ")}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{fmtNum(s.capacity_units_month)}</td>
                  <td className="px-4 py-3 text-right"><EsgPill score={s.esg_score} /></td>
                  <td className="px-4 py-3"><SupplierBadge kind={c.kind} /></td>
                  <td className="px-4 py-3 text-mutedfg max-w-[260px]">{c.reason}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
