"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { Card, SectionTitle } from "@/components/ui";

const AGENTS = [
  { i: "①", t: "Graph Agent", d: "Traverses the supplier graph ($graphLookup) to find impacted orders & capacity gaps." },
  { i: "②", t: "Vector Agent", d: "Semantic search ($vectorSearch) for capable backup suppliers." },
  { i: "③", t: "Compliance RAG", d: "Vets candidates against ESG, sanctions & labour policy (Vector RAG)." },
  { i: "④", t: "Planner Agent", d: "Scores reroute options on cost, lead-time & confidence." },
  { i: "⑤", t: "Mitigation Agent", d: "Drafts a mitigation brief and recommends auto-execute or human review." },
];

export default function IntakePage() {
  const router = useRouter();
  const [form, setForm] = useState({
    eventType: "Typhoon",
    region: "Tanjung Pelepas, Malaysia",
    product: "Automotive-grade MCU",
    supplier: "SUP-001",
    issue: "Port closed for 72h — supplier has stock but cannot deliver 23 active orders (48,200 units)",
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const disruption = await api.createDisruption(form);
      const disruption_id = disruption?._id ?? disruption?.id ?? disruption?.disruption_id;
      const { thread_id } = await api.startWorkflow({ disruption_id });
      router.push(`/workflow?thread_id=${encodeURIComponent(thread_id)}`);
    } catch (e: any) {
      setErr(`Failed to start workflow: ${e.message}`);
      setLoading(false);
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <div className="label">Operational Console</div>
        <h1 className="text-3xl font-bold">Disruption Intake</h1>
        <p className="text-sm text-mutedfg mt-1">
          Report a supply-chain event to trigger the autonomous mitigation workflow.
        </p>
      </div>

      {err && (
        <motion.div
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className="card p-4 border-danger/50 bg-danger/10 text-danger text-sm mb-6"
        >
          {err}
        </motion.div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        <motion.div
          className="md:col-span-2"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <Card>
            <SectionTitle kicker="New Event" title="Describe the Disruption" />
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label" htmlFor="eventType">Event Type</label>
                  <input id="eventType" className="input" value={form.eventType} onChange={set("eventType")} placeholder="Typhoon, Port closure…" />
                </div>
                <div>
                  <label className="label" htmlFor="region">Region</label>
                  <input id="region" className="input" value={form.region} onChange={set("region")} placeholder="Region / facility" />
                </div>
                <div>
                  <label className="label" htmlFor="product">Product</label>
                  <input id="product" className="input" value={form.product} onChange={set("product")} placeholder="Affected SKU / product" />
                </div>
                <div>
                  <label className="label" htmlFor="supplier">Supplier</label>
                  <input id="supplier" className="input" value={form.supplier} onChange={set("supplier")} placeholder="SUP-001" />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="issue">Issue</label>
                <textarea id="issue" className="input min-h-[96px] resize-y" value={form.issue} onChange={set("issue")} placeholder="What happened and what is the impact?" />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? "Starting workflow…" : "Trigger Mitigation Workflow →"}
                </button>
                <span className="text-xs text-mutedfg">Creates a disruption record and launches the 5-agent run.</span>
              </div>
            </form>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.08 }}
        >
          <Card className="h-full">
            <SectionTitle kicker="What happens next" title="The Agent Pipeline" />
            <div className="space-y-3">
              {AGENTS.map((a) => (
                <div key={a.t} className="flex gap-3 border-b border-border/40 pb-3 last:border-0 last:pb-0">
                  <div className="text-accent text-lg leading-none mt-0.5">{a.i}</div>
                  <div>
                    <div className="text-sm font-medium">{a.t}</div>
                    <div className="text-xs text-mutedfg">{a.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
