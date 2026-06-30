"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { Card, SectionTitle, Stat } from "@/components/ui";
import { CodeBlock } from "@/components/CopyButton";

const DEMO_TEXT =
  "Typhoon Yagi has closed the Port of Tanjung Pelepas (Malaysia) for 72 hours. " +
  "Primary supplier SUP-001 cannot deliver orders ORD-1044, ORD-1045, ORD-1046 " +
  "totalling 48,200 units of automotive-grade MCUs.";
const DEMO_Q = "What is the connection between SUP-001 and ORD-1044 and Malaysia?";

const typeColor: Record<string, string> = {
  supplier: "text-danger", order: "text-info", region: "text-warn",
  product: "text-accent2", event: "text-danger", port: "text-warn",
};

export default function GraphRag() {
  const [text, setText] = useState(DEMO_TEXT);
  const [question, setQuestion] = useState(DEMO_Q);
  const [graph, setGraph] = useState<any>(null);
  const [ans, setAns] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function build() {
    setBusy("extract"); setErr(null);
    try { setGraph(await api.graphragExtract(text)); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }
  async function ask() {
    setBusy("ask"); setErr(null);
    try { setAns(await api.graphragAsk(question)); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <div className="label">Canonical GraphRAG · MongoDBGraphStore-style</div>
        <h1 className="text-3xl font-bold">Knowledge-Graph Retrieval</h1>
        <p className="text-sm text-mutedfg mt-1">
          LLM entity extraction → <span className="text-accent2">multi-hop $graphLookup</span> →
          grounded answer. A separate retrieval mode from the core blast-radius graph.
        </p>
      </div>

      {err && <div className="card p-3 border-danger/50 bg-danger/10 text-danger text-sm mb-5">{err}</div>}

      <div className="grid md:grid-cols-2 gap-4 mb-5">
        {/* Step 1 — extract */}
        <Card>
          <SectionTitle kicker="Step 1" title="Extract entities → knowledge_graph" />
          <textarea className="input h-32 resize-none" value={text}
            onChange={(e) => setText(e.target.value)} />
          <button className="btn-primary mt-3" onClick={build} disabled={busy === "extract"}>
            {busy === "extract" ? "Extracting…" : "Build Knowledge Graph"}
          </button>
          {graph && (
            <div className="mt-4">
              <div className="flex gap-3 mb-3">
                <Stat label="Entities" value={graph.entities} tone="accent" />
                <Stat label="Relationships" value={graph.relationships} tone="info" />
              </div>
              <div className="flex flex-wrap gap-2">
                {graph.nodes?.map((n: any, i: number) => (
                  <motion.span key={n.name} initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }}
                    className="chip border-border bg-muted/40">
                    <span className={typeColor[n.type] || "text-fg"}>●</span>
                    <span className="font-mono text-xs">{n.name}</span>
                  </motion.span>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Step 2 — ask */}
        <Card>
          <SectionTitle kicker="Step 2" title="Ask — multi-hop traversal + grounded answer" />
          <input className="input" value={question} onChange={(e) => setQuestion(e.target.value)} />
          <button className="btn-primary mt-3" onClick={ask} disabled={busy === "ask" || !graph}>
            {busy === "ask" ? "Traversing…" : "Ask the Graph"}
          </button>
          {!graph && <p className="text-xs text-mutedfg mt-2">Build the graph first.</p>}
          {ans && (
            <div className="mt-4 space-y-3">
              <div className="card p-3 border-accent/30 bg-accent/5">
                <div className="label mb-1">Grounded Answer</div>
                <div className="text-sm">{ans.answer}</div>
              </div>
              <div className="text-xs text-mutedfg">
                Seeds: {ans.seeds?.join(", ") || "—"} · {ans.subgraph?.length || 0} connected entities
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ans.subgraph?.map((n: any) => (
                  <span key={n.name} className="chip border-border bg-muted/40 text-xs">
                    {n.name} <span className="text-mutedfg">·hop {n.hop}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Edges + pipeline */}
      {ans && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <SectionTitle kicker="Traversed" title="Relationships (edges)" />
            <div className="space-y-1.5 text-sm font-mono">
              {ans.edges?.length ? ans.edges.map((e: any, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-info">{e.source}</span>
                  <span className="text-mutedfg">—{e.relation}→</span>
                  <span className="text-accent2">{e.target}</span>
                </div>
              )) : <div className="text-mutedfg">No edges.</div>}
            </div>
          </Card>
          <Card>
            <SectionTitle kicker="MongoDB" title="The multi-hop $graphLookup" />
            <CodeBlock lang="aggregation" code={JSON.stringify(ans.pipeline, null, 2)} />
          </Card>
        </div>
      )}
    </div>
  );
}
