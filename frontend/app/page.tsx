"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, API_BASE } from "@/lib/api";
import { Stat } from "@/components/ui";
import { DisruptionChat } from "@/components/DisruptionChat";

export default function Dashboard() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await api.suppliers();
        setSuppliers(s.items);
      } catch (e: any) {
        setErr(`Cannot reach API at ${API_BASE}. Is the backend running? (${e.message})`);
      }
    })();
  }, []);

  const impacted = suppliers.filter((s) => s.disrupted).length;
  const compliant = suppliers.filter((s) => s.esg_score >= 60).length;
  const atRisk = suppliers.filter((s) => s.esg_score < 60).length;

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="label">Operational Console</div>
          <h1 className="text-3xl font-bold">Supply-Chain Resilience Dashboard</h1>
        </div>
      </div>

      {err && (
        <div className="card p-4 border-danger/50 bg-danger/10 text-danger text-sm mb-6">{err}</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <Stat label="Suppliers Tracked" value={suppliers.length} hint="in supplier graph" />
        <Stat label="Disrupted" value={impacted} tone="danger" hint="active disruption" />
        <Stat label="Compliant (ESG≥60)" value={compliant} tone="accent" />
        <Stat label="At-Risk (ESG<60)" value={atRisk} tone="warn" />
      </div>

      {/* Expand/collapse Disruption Intake — chat front-end to the workflow */}
      <button
        onClick={() => setIntakeOpen((o) => !o)}
        className="w-full flex items-center justify-between rounded-xl border border-border/70 bg-surface2/40 px-4 py-3 hover:border-accent/60 hover:bg-accent/5 transition-colors"
        aria-expanded={intakeOpen}
      >
        <span className="flex items-center gap-2 font-medium">
          <span className="text-accent">⚠</span> Report a Disruption
        </span>
        <motion.span animate={{ rotate: intakeOpen ? 90 : 0 }} className="text-mutedfg">▸</motion.span>
      </button>

      <AnimatePresence initial={false}>
        {intakeOpen && (
          <motion.div
            key="intake"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <DisruptionChat />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
