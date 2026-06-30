"use client";
import { motion } from "framer-motion";
import { Card, SectionTitle } from "@/components/ui";
import { CodeBlock } from "@/components/CopyButton";

const AGENTS: { name: string; tag: string; tone: string; desc: string }[] = [
  {
    name: "1 · Supervisor",
    tag: "orchestrator",
    tone: "border-info/50 text-info bg-info/10",
    desc: "Routes the LangGraph state machine — parses the inbound alert, sets severity & affected region, and sequences the four specialist agents.",
  },
  {
    name: "2 · Impact Assessor",
    tag: "$graphLookup",
    tone: "border-accent/50 text-accent bg-accent/10",
    desc: "Computes the blast radius with a recursive $graphLookup over orders → suppliers.depends_on, summing quantity_remaining across the dependency chain.",
  },
  {
    name: "3 · Sourcing",
    tag: "$vectorSearch",
    tone: "border-accent2/50 text-accent2 bg-accent2/10",
    desc: "Finds capable backup suppliers via native Atlas $vectorSearch on supplier embeddings, filtered by spare monthly capacity.",
  },
  {
    name: "4 · Compliance",
    tag: "Vector RAG",
    tone: "border-warn/50 text-warn bg-warn/10",
    desc: "Retrieves grounding policy passages with $vectorSearch over compliance_policies, then has Bedrock reason over them (RAG) to pass/fail each candidate.",
  },
  {
    name: "5 · Mitigation Planner",
    tag: "deterministic confidence",
    tone: "border-danger/50 text-danger bg-danger/10",
    desc: "Scores vetted options on cost / lead-time / ESG with a deterministic confidence model and recommends AUTO_EXECUTE vs HUMAN_REVIEW.",
  },
];

const CURL_HEALTH = `curl http://localhost:8010/health`;
const CURL_RUN = `curl -X POST http://localhost:8010/workflow/run \\
  -H 'Content-Type: application/json' \\
  -d '{"alert_text":"Typhoon forces 7-day closure of the Port of Chengdu; SUP-CHENGDU-01 cannot ship."}'`;

export default function Docs() {
  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <div className="label">Documentation</div>
        <h1 className="text-3xl font-bold">ResilioChain Docs</h1>
        <p className="text-sm text-mutedfg mt-1">
          An agentic supply-chain resilience platform — from disruption alert to an
          auditable, compliance-vetted mitigation plan.
        </p>
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <Card>
          <SectionTitle kicker="Overview" title="What is ResilioChain?" />
          <p className="text-sm text-mutedfg leading-relaxed">
            ResilioChain turns a raw disruption signal — a typhoon, a port closure, a new
            sanctions ruling — into a concrete, defensible plan in seconds. A team of
            LangGraph agents assesses the blast radius across your supplier graph, sources
            compliant alternatives with semantic search, vets them against your compliance
            corpus with retrieval-augmented reasoning, and produces a ranked mitigation
            brief with a confidence score and a clear recommended action. Every step is
            written to an immutable audit log so operators can trust — and explain — the call.
          </p>
        </Card>

        <Card>
          <SectionTitle kicker="System Design" title="Architecture" />
          <p className="text-sm text-mutedfg leading-relaxed mb-4">
            A single linear flow ties an external trigger to a multi-agent graph, a unified
            data + AI layer, and a frontier LLM for reasoning:
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {[
              { t: "External Trigger", s: "alert / webhook", c: "border-info/50 text-info bg-info/10" },
              { t: "LangGraph · 5 Agents", s: "orchestration", c: "border-accent/50 text-accent bg-accent/10" },
              { t: "MongoDB Atlas", s: "docs · graph · vector", c: "border-accent2/50 text-accent2 bg-accent2/10" },
              { t: "AWS Bedrock", s: "reasoning LLM", c: "border-warn/50 text-warn bg-warn/10" },
            ].map((n, i, arr) => (
              <div key={n.t} className="flex items-center gap-2">
                <div className={`chip flex-col items-start py-2 px-3 ${n.c}`}>
                  <span className="font-semibold">{n.t}</span>
                  <span className="text-[10px] opacity-70 normal-case">{n.s}</span>
                </div>
                {i < arr.length - 1 && <span className="text-mutedfg">→</span>}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle
            kicker="Agents"
            title="The 5 Agents"
            sub="MongoDB does the heavy lifting — graph traversal and vector search are native aggregation stages, not bolt-on services."
          />
          <div className="space-y-3">
            {AGENTS.map((a) => (
              <div key={a.name} className="border-b border-border/40 pb-3 last:border-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-fg">{a.name}</span>
                  <span className={`chip ${a.tone}`}>{a.tag}</span>
                </div>
                <p className="text-sm text-mutedfg leading-relaxed">{a.desc}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle
            kicker="Get Going"
            title="Quick Start"
            sub="The API runs on http://localhost:8010. Try the health check, then kick off a full workflow."
          />
          <div className="space-y-4">
            <div>
              <div className="label mb-1">Health check</div>
              <CodeBlock lang="bash" code={CURL_HEALTH} />
            </div>
            <div>
              <div className="label mb-1">Run a workflow end-to-end</div>
              <CodeBlock lang="bash" code={CURL_RUN} />
            </div>
          </div>
        </Card>

        <Card>
          <SectionTitle kicker="Reference" title="More Documentation" />
          <div className="grid sm:grid-cols-3 gap-3">
            <a
              href="http://localhost:8010/docs"
              target="_blank"
              rel="noreferrer"
              className="card p-4 hover:border-accent/50 transition-colors block"
            >
              <div className="text-2xl mb-2">⚡</div>
              <div className="font-semibold mb-1">Interactive API Docs</div>
              <div className="text-xs text-mutedfg">Swagger UI · localhost:8010/docs</div>
            </a>
            <div className="card p-4">
              <div className="text-2xl mb-2">🛠</div>
              <div className="font-semibold mb-1">Technical Guide</div>
              <div className="text-xs text-mutedfg font-mono">docs/technical.html</div>
            </div>
            <div className="card p-4">
              <div className="text-2xl mb-2">📘</div>
              <div className="font-semibold mb-1">Non-Technical Overview</div>
              <div className="text-xs text-mutedfg font-mono">docs/non-technical.html</div>
            </div>
          </div>
          <p className="text-xs text-mutedfg mt-3">
            The full technical and non-technical guides live in the repo under{" "}
            <span className="font-mono">docs/</span>.
          </p>
        </Card>
      </motion.div>
    </div>
  );
}
