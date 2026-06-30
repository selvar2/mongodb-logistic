"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { Card, SectionTitle, Stat, SeverityChip } from "@/components/ui";

export default function Dashboard() {
  const [health, setHealth] = useState<any>(null);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [disruptions, setDisruptions] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [h, s, d] = await Promise.all([
          api.health(), api.suppliers(), api.disruptions(),
        ]);
        setHealth(h); setSuppliers(s.items); setDisruptions(d.items);
      } catch (e: any) {
        setErr(`Cannot reach API at ${process.env.NEXT_PUBLIC_API_BASE}. Is the backend running? (${e.message})`);
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

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {[
          { href: "/intake", t: "Report a Disruption", d: "Typhoon, port closure, sanctions — kick off the agent workflow.", i: "⚠" },
          { href: "/workflow", t: "Watch Agents Work", d: "Live LangGraph state machine: graph → vector → RAG → plan.", i: "⟳" },
          { href: "/data-explorer", t: "Explore MongoDB", d: "$graphLookup, $vectorSearch & Vector RAG pipelines.", i: "⛁" },
        ].map((c, i) => (
          <motion.div key={c.href} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}>
            <Link href={c.href}>
              <Card className="h-full hover:border-accent/50 transition-colors cursor-pointer">
                <div className="text-2xl mb-2">{c.i}</div>
                <div className="font-semibold mb-1">{c.t}</div>
                <div className="text-sm text-mutedfg">{c.d}</div>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <SectionTitle kicker="System" title="Platform Health" />
          {health ? (
            <div className="space-y-2 text-sm">
              <Row k="API" v={<span className="text-accent">● {health.status}</span>} />
              <Row k="MongoDB Atlas" v={health.mongo?.connected ? <span className="text-accent">● connected</span> : <span className="text-danger">● down</span>} />
              <Row k="LLM" v={`${health.llm?.mode} · ${(health.llm?.model || "").split(".").pop()}`} />
              <Row k="Region" v={health.llm?.region} />
            </div>
          ) : <div className="text-mutedfg text-sm">Loading…</div>}
        </Card>
        <Card>
          <SectionTitle kicker="History" title="Recent Disruptions" />
          {disruptions.length === 0 ? (
            <div className="text-mutedfg text-sm">No disruptions yet. <Link href="/intake" className="text-accent">Report one →</Link></div>
          ) : (
            <div className="space-y-2">
              {disruptions.slice(0, 5).map((d) => (
                <div key={d._id} className="flex items-center justify-between text-sm border-b border-border/50 pb-2">
                  <div>
                    <div className="font-medium">{d.eventType} · {d.region}</div>
                    <div className="text-xs text-mutedfg">{d.supplier_id || "—"}</div>
                  </div>
                  <SeverityChip severity="HIGH" />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
      <span className="text-mutedfg">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}
