"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, API_BASE } from "@/lib/api";
import { Stat, spotlightMove } from "@/components/ui";
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
      <div className="relative flex items-center justify-center mb-8 min-h-[56px]">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">ResilioChain</h1>
        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mongodb-logo.svg" alt="MongoDB" className="h-8 w-auto opacity-90" />
          <span className="h-6 w-px bg-border/70" aria-hidden />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/accenture-logo.svg" alt="Accenture" className="h-8 w-auto opacity-90" />
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
        onPointerMove={spotlightMove}
        className="spotlight group w-full flex items-center justify-between rounded-xl border border-border/70 bg-surface2/40 px-4 py-3 hover:bg-accent/5 transition-all duration-300 hover:-translate-y-0.5"
        aria-expanded={intakeOpen}
      >
        <span className="flex items-center gap-2 font-medium">
          <span className="text-accent text-lg inline-block transition-transform duration-300 group-hover:scale-125 group-hover:-rotate-12">⚠</span>
          Report a Disruption
        </span>
        <motion.span animate={{ rotate: intakeOpen ? 90 : 0 }} className="text-mutedfg transition-colors group-hover:text-accent">▸</motion.span>
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
