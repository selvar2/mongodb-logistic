"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, API_BASE } from "@/lib/api";
import { Stat } from "@/components/ui";

export default function Dashboard() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

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
        <Link href="/intake" className="btn-primary">+ Report Disruption</Link>
      </div>

      {err && (
        <div className="card p-4 border-danger/50 bg-danger/10 text-danger text-sm mb-6">{err}</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat label="Suppliers Tracked" value={suppliers.length} hint="in supplier graph" />
        <Stat label="Disrupted" value={impacted} tone="danger" hint="active disruption" />
        <Stat label="Compliant (ESG≥60)" value={compliant} tone="accent" />
        <Stat label="At-Risk (ESG<60)" value={atRisk} tone="warn" />
      </div>

    </div>
  );
}
