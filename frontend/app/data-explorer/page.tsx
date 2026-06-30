"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { Card, SectionTitle, Stat, fmtNum } from "@/components/ui";
import { CodeBlock } from "@/components/CopyButton";
import { EsgPill } from "@/components/SupplierBadge";

type Tab = "suppliers" | "orders" | "policies";

function truncate(s: string, n = 140) {
  if (!s) return "—";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

const PIPELINE_SNIPPETS: { title: string; lang: string; code: string }[] = [
  {
    title: "(a) $graphLookup — blast radius",
    lang: "mongosh · db.orders",
    code: `// resiliochain.orders — recursive downstream blast radius
db.orders.aggregate([
  { $match: { supplier_id: "SUP-CHENGDU-01" } },
  { $graphLookup: {
      from: "suppliers",
      startWith: "$depends_on",
      connectFromField: "depends_on",
      connectToField: "_id",
      as: "impacted_chain",
      maxDepth: 5,
      depthField: "tier"
  }},
  { $group: {
      _id: "$supplier_id",
      affected_orders: { $sum: 1 },
      quantity_remaining: { $sum: "$quantity_remaining" },
      tiers_touched: { $addToSet: "$impacted_chain._id" }
  }}
])`,
  },
  {
    title: "(b) $vectorSearch — sourcing alternatives",
    lang: "mongosh · db.suppliers",
    code: `// resiliochain.suppliers — semantic match on capabilities
db.suppliers.aggregate([
  { $vectorSearch: {
      index: "supplier_vector_index",
      path: "embed_text",
      query: { text: "high-precision lithium cell assembly, automotive grade" },
      numCandidates: 200,
      limit: 10,
      filter: { capacity_units_month: { $gte: 48200 } }
  }},
  { $project: {
      _id: 1, name: 1, geo_region: 1, esg_score: 1,
      lead_time_days: 1, capacity_units_month: 1,
      score: { $meta: "vectorSearchScore" }
  }}
])`,
  },
  {
    title: "(c) $vectorSearch — compliance RAG",
    lang: "mongosh · db.compliance_policies",
    code: `// resiliochain.compliance_policies — retrieve grounding docs for RAG
db.compliance_policies.aggregate([
  { $vectorSearch: {
      index: "policy_vector_index",
      path: "text",
      query: { text: "forced labour sanctions for Xinjiang-region suppliers" },
      numCandidates: 150,
      limit: 5
  }},
  { $project: {
      source_doc: 1, policy_type: 1, text: 1,
      score: { $meta: "vectorSearchScore" }
  }}
])
// → top-k passages are injected into the Bedrock prompt as grounding context`,
  },
];

export default function DataExplorer() {
  const [tab, setTab] = useState<Tab>("suppliers");
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [pipelines, setPipelines] = useState<Record<string, any> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, o, p, pl] = await Promise.all([
          api.suppliers(),
          api.orders(),
          api.policies(),
          api.pipelines(),
        ]);
        setSuppliers(s.items);
        setOrders(o.items);
        setPolicies(p.items);
        setPipelines(pl);
      } catch (e: any) {
        setErr(`Cannot reach API. Is the backend running? (${e.message})`);
      }
    })();
  }, []);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "suppliers", label: "Suppliers", count: suppliers.length },
    { key: "orders", label: "Orders", count: orders.length },
    { key: "policies", label: "Compliance Policies", count: policies.length },
  ];

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <div className="label">Atlas Console</div>
        <h1 className="text-3xl font-bold">MongoDB Data Explorer</h1>
        <p className="text-sm text-mutedfg mt-1">
          The operational + AI core of ResilioChain — one database powering documents,
          graph traversal and vector search in <span className="font-mono">resiliochain</span>.
        </p>
      </div>

      {err && (
        <div className="card p-4 border-danger/50 bg-danger/10 text-danger text-sm mb-6">{err}</div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Stat label="Suppliers" value={fmtNum(suppliers.length)} hint="suppliers collection" tone="accent" />
        <Stat label="Orders" value={fmtNum(orders.length)} hint="orders collection" tone="info" />
        <Stat label="Compliance Policies" value={fmtNum(policies.length)} hint="compliance_policies" tone="warn" />
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`chip transition-colors ${
              tab === t.key
                ? "border-accent/60 text-accent bg-accent/10"
                : "border-border text-mutedfg hover:text-fg"
            }`}
          >
            {t.label} <span className="opacity-60">· {t.count}</span>
          </button>
        ))}
      </div>

      <Card className="mb-8 p-0 overflow-hidden">
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full text-sm">
            {tab === "suppliers" && (
              <>
                <thead className="sticky top-0 bg-surface border-b border-border z-10">
                  <tr className="text-left text-mutedfg">
                    <Th>ID</Th><Th>Name</Th><Th>Region</Th><Th>Capacity</Th>
                    <Th>ESG</Th><Th>Lead Time</Th><Th>Certifications</Th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((s) => (
                    <tr key={s._id} className="border-b border-border/40 hover:bg-muted/30">
                      <Td mono>{s._id}</Td>
                      <Td>{s.name}{s.disrupted && <span className="ml-2 chip border-danger/50 text-danger bg-danger/10">disrupted</span>}</Td>
                      <Td>{s.geo_region}</Td>
                      <Td mono>{fmtNum(s.capacity_units_month)}/mo</Td>
                      <Td><EsgPill score={s.esg_score} /></Td>
                      <Td mono>{s.lead_time_days}d</Td>
                      <Td className="text-mutedfg">{(s.certifications || []).join(", ") || "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}

            {tab === "orders" && (
              <>
                <thead className="sticky top-0 bg-surface border-b border-border z-10">
                  <tr className="text-left text-mutedfg">
                    <Th>Order #</Th><Th>Status</Th><Th>Supplier</Th>
                    <Th>SKUs</Th><Th>Qty Remaining</Th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o._id || o.order_number} className="border-b border-border/40 hover:bg-muted/30">
                      <Td mono>{o.order_number}</Td>
                      <Td><span className="chip border-info/40 text-info bg-info/10">{o.status}</span></Td>
                      <Td mono>{o.supplier_id}</Td>
                      <Td className="text-mutedfg">{(o.sku_ids || []).join(", ") || "—"}</Td>
                      <Td mono>{fmtNum(o.quantity_remaining)}</Td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}

            {tab === "policies" && (
              <>
                <thead className="sticky top-0 bg-surface border-b border-border z-10">
                  <tr className="text-left text-mutedfg">
                    <Th>Source Doc</Th><Th>Policy Type</Th><Th>Text</Th>
                  </tr>
                </thead>
                <tbody>
                  {policies.map((p, i) => (
                    <tr key={p._id || i} className="border-b border-border/40 hover:bg-muted/30 align-top">
                      <Td mono>{p.source_doc}</Td>
                      <Td><span className="chip border-warn/40 text-warn bg-warn/10">{p.policy_type}</span></Td>
                      <Td className="text-mutedfg max-w-xl">{truncate(p.text)}</Td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}
          </table>
        </div>
      </Card>

      {/* MongoDB AI Pipelines */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <SectionTitle
          kicker="MongoDB as the AI Core"
          title="MongoDB AI Pipelines"
          sub="The exact aggregation approaches the agents run — graph traversal and native vector search, copyable for your own mongosh / driver."
        />

        {pipelines && (
          <div className="grid gap-4 mb-6">
            {Object.entries(pipelines).map(([name, def]) => (
              <Card key={name}>
                <div className="font-mono text-sm text-accent2 mb-2">{name}</div>
                <CodeBlock
                  lang="server-defined pipeline"
                  code={typeof def === "string" ? def : JSON.stringify(def, null, 2)}
                />
              </Card>
            ))}
          </div>
        )}

        <div className="grid gap-4">
          {PIPELINE_SNIPPETS.map((s) => (
            <Card key={s.title}>
              <div className="font-mono text-sm text-accent mb-2">{s.title}</div>
              <CodeBlock lang={s.lang} code={s.code} />
            </Card>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wide whitespace-nowrap">{children}</th>;
}
function Td({ children, mono, className = "" }: { children: React.ReactNode; mono?: boolean; className?: string }) {
  return <td className={`px-4 py-2.5 ${mono ? "font-mono text-xs" : ""} ${className}`}>{children}</td>;
}
