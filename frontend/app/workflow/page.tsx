"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { api, streamWorkflow } from "@/lib/api";
import type { StepEvent, WorkflowState } from "@/lib/types";
import { AgentGraph, type AgentStatus } from "@/components/AgentGraph";
import { Timeline } from "@/components/Timeline";
import { ConfidenceGauge } from "@/components/ConfidenceGauge";
import { Card, SectionTitle, SeverityChip, ActionChip } from "@/components/ui";

const DEMO_ALERT =
  "Typhoon Yagi has closed the Port of Tanjung Pelepas (Malaysia) for 72 hours. Primary supplier SUP-001 (Chang Electronics, Malaysia) has stock but cannot deliver 23 active orders totalling 48,200 units of automotive-grade MCUs and sensor components.";

// Maps an agent name from a StepEvent to a graph node id.
const AGENT_ORDER = ["supervisor", "impact_assessor", "sourcing", "compliance", "planner"];
function nodeIdFor(agent: string): string | null {
  const a = (agent || "").toLowerCase();
  if (a.includes("supervisor")) return "supervisor";
  if (a.includes("impact")) return "impact_assessor";
  if (a.includes("sourc")) return "sourcing";
  if (a.includes("complian")) return "compliance";
  if (a.includes("plan")) return "planner";
  return null;
}

function deriveStatuses(steps: StepEvent[], done: boolean): Record<string, AgentStatus> {
  const statuses: Record<string, AgentStatus> = {};
  const seenOrder: string[] = [];
  let complianceFail = false;

  for (const s of steps) {
    const id = nodeIdFor(s.agent);
    if (!id) continue;
    if (!seenOrder.includes(id)) seenOrder.push(id);
    if (id === "compliance" && (s.summary || "").trim().toUpperCase().startsWith("FAIL")) {
      complianceFail = true;
    }
  }

  // Everything seen is 'done' except the most recent active node.
  seenOrder.forEach((id, i) => {
    statuses[id] = i === seenOrder.length - 1 && !done ? "active" : "done";
  });

  if (done) {
    for (const id of seenOrder) statuses[id] = "done";
  }
  if (complianceFail && statuses["compliance"] && !done) {
    statuses["compliance"] = "fail";
  }
  // Ensure all nodes have an entry (idle default handled by component too).
  for (const id of AGENT_ORDER) if (!statuses[id]) statuses[id] = "idle";
  return statuses;
}

function WorkflowInner() {
  const params = useSearchParams();
  const urlThread = params.get("thread_id");

  const [threadId, setThreadId] = useState<string | null>(urlThread);
  const [steps, setSteps] = useState<StepEvent[]>([]);
  const [final, setFinal] = useState<WorkflowState | null>(null);
  const [done, setDone] = useState(false);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  // Stream whenever we have a thread id.
  useEffect(() => {
    if (!threadId) return;
    setSteps([]);
    setFinal(null);
    setDone(false);
    setErr(null);

    const unsub = streamWorkflow(
      threadId,
      (s) => setSteps((prev) => [...prev, s]),
      (f) => {
        setFinal(f);
        setDone(true);
      },
    );
    unsubRef.current = unsub;
    return () => {
      unsub();
      unsubRef.current = null;
    };
  }, [threadId]);

  // Clean up on unmount.
  useEffect(() => () => unsubRef.current?.(), []);

  async function runDemo() {
    setStarting(true);
    setErr(null);
    try {
      const { thread_id } = await api.startWorkflow({ alert_text: DEMO_ALERT });
      setThreadId(thread_id);
    } catch (e: any) {
      setErr(`Failed to start workflow: ${e.message}`);
    } finally {
      setStarting(false);
    }
  }

  const statuses = deriveStatuses(steps, done);
  const brief = final?.mitigation_brief;
  const rawConf = final?.confidence_score ?? brief?.confidence_score;
  const confidence =
    rawConf == null ? null : rawConf <= 1 ? Math.round(rawConf * 100) : Math.round(rawConf);

  return (
    <div className="max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="label">Live LangGraph State Machine</div>
          <h1 className="text-3xl font-bold">Agent Workflow Status</h1>
          {threadId && (
            <div className="text-xs text-mutedfg font-mono mt-1">thread {threadId}</div>
          )}
        </div>
        <button className="btn-primary" onClick={runDemo} disabled={starting}>
          {starting ? "Starting…" : "▶ Run Demo Workflow"}
        </button>
      </div>

      {err && (
        <div className="card p-4 border-danger/50 bg-danger/10 text-danger text-sm mb-6">{err}</div>
      )}

      <div className="grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <Card>
            <SectionTitle
              kicker="Orchestration"
              title="Agent Graph"
              sub="Supervisor routes through impact → sourcing → compliance → planner."
            />
            <AgentGraph statuses={statuses} />
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="h-full">
            <SectionTitle kicker="Stream" title="Live Timeline" />
            {steps.length === 0 ? (
              <div className="text-mutedfg text-sm">
                {threadId
                  ? "Waiting for agent steps…"
                  : "Run the demo workflow to watch the agents work."}
              </div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto pr-1">
                <Timeline steps={steps} />
              </div>
            )}
          </Card>
        </div>
      </div>

      {done && final && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mt-6"
        >
          <Card>
            <SectionTitle kicker="Result" title="Mitigation Brief" />
            <div className="grid md:grid-cols-4 gap-6 items-center">
              <div className="flex justify-center">
                <ConfidenceGauge value={confidence ?? 0} />
              </div>
              <div className="md:col-span-3 grid grid-cols-2 gap-4">
                <Field label="Severity">
                  <SeverityChip severity={final.severity} />
                </Field>
                <Field label="Recommended Action">
                  <ActionChip action={final.recommended_action ?? brief?.recommended_action} />
                </Field>
                <Field label="Backup Supplier (Winner)">
                  <span className="text-lg font-semibold text-accent">
                    {brief?.backup_supplier_name || brief?.backup_supplier || "—"}
                  </span>
                </Field>
                <Field label="Reroute Via">
                  <span className="text-sm">{brief?.reroute_via || "—"}</span>
                </Field>
                {brief?.summary && (
                  <div className="col-span-2">
                    <div className="label mb-1">Summary</div>
                    <p className="text-sm text-fg/90">{brief.summary}</p>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label mb-1">{label}</div>
      <div>{children}</div>
    </div>
  );
}

export default function WorkflowPage() {
  return (
    <Suspense
      fallback={<div className="max-w-7xl text-mutedfg text-sm">Loading workflow…</div>}
    >
      <WorkflowInner />
    </Suspense>
  );
}
