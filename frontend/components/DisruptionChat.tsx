"use client";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, streamWorkflow } from "@/lib/api";
import type { StepEvent, WorkflowState } from "@/lib/types";
import { AgentGraph, type AgentStatus } from "@/components/AgentGraph";
import { Timeline } from "@/components/Timeline";
import { ConfidenceGauge } from "@/components/ConfidenceGauge";
import { Card, SectionTitle, SeverityChip, ActionChip } from "@/components/ui";

// Natural-language disruption scenarios. Each string is the exact alert_text
// sent to POST /workflow/start — the Supervisor LLM parses it directly, the
// same path a free-typed message takes.
const SCENARIOS: string[] = [
  "A typhoon in Tanjung Pelepas, Malaysia is blocking shipments of automotive-grade MCUs from SUP-001 — the port is closed for 72 hours and 23 orders (48,200 units) can't ship.",
  "An earthquake near Bandung, Indonesia has halted production of MEMS sensors at SUP-004 — the line is down 5 days and 12 orders (18,400 units) are at risk.",
  "New trade sanctions on Hanoi, Vietnam are blocking exports of 32-bit microcontrollers from SUP-008 — customs is holding all shipments and 9 orders (15,000 units) are stranded.",
  "A port workers' strike in Busan, South Korea is delaying outbound AEC-Q100 MCUs from SUP-005 — no vessels are loading and 7 orders (11,200 units) miss this week's window.",
  "A ransomware attack on Jakarta, Indonesia has frozen MES systems for 32-bit MCUs at SUP-010 — production is paused 48 hours and 6 orders (9,800 units) are at risk.",
  "A monsoon flood in Penang, Malaysia has stopped fab output of 16-bit MCUs at SUP-006 — cleanrooms lost power and 11 orders (22,500 units) slip 10 days.",
  "A wildfire around Ulsan, South Korea has cut road access for IMU sensor modules from SUP-014 — trucks can't reach the warehouse and 4 orders (6,500 units) are stranded.",
  "An ESG compliance breach in Ho Chi Minh City, Vietnam has forced an audit of automotive MCUs from SUP-FAIL — supplier is suspended and 8 orders (13,200 units) must be re-sourced.",
  "A port closure at Singapore transshipment hub is delaying automotive sensor components from SUP-013 — nothing is transshipping for 36 hours and 5 orders (8,400 units) miss ETA.",
  "A raw-material shortage affecting Medan, Indonesia has slowed output of AEC-Q100 MCUs and sensors from SUP-013 — output is at 40% capacity and 14 orders (28,000 units) slip 2 weeks.",
];

// --- workflow status helpers (mirrors /workflow page) ---
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
    if (id === "compliance" && (s.summary || "").trim().toUpperCase().startsWith("FAIL")) complianceFail = true;
  }
  seenOrder.forEach((id, i) => {
    statuses[id] = i === seenOrder.length - 1 && !done ? "active" : "done";
  });
  if (done) for (const id of seenOrder) statuses[id] = "done";
  if (complianceFail && statuses["compliance"] && !done) statuses["compliance"] = "fail";
  for (const id of AGENT_ORDER) if (!statuses[id]) statuses[id] = "idle";
  return statuses;
}

type ChatMsg = { role: "user" | "assistant"; text: string };

export function DisruptionChat() {
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      text: "Describe a supply-chain disruption in plain English — or tap a scenario below. I'll parse it and run the 5-agent mitigation workflow live.",
    },
  ]);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepEvent[]>([]);
  const [final, setFinal] = useState<WorkflowState | null>(null);
  const [done, setDone] = useState(false);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Human-in-the-loop review state (only for HUMAN_REVIEW briefs)
  const [decision, setDecision] = useState<null | "approved" | "rejected">(null);
  const [showReject, setShowReject] = useState(false);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewErr, setReviewErr] = useState<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  // Stream whenever a thread is active.
  useEffect(() => {
    if (!threadId) return;
    setSteps([]);
    setFinal(null);
    setDone(false);
    // reset review state for the new run
    setDecision(null);
    setShowReject(false);
    setReviewComment("");
    setReviewErr(null);
    const unsub = streamWorkflow(
      threadId,
      (s) => setSteps((prev) => [...prev, s]),
      (f) => {
        setFinal(f);
        setDone(true);
        setMessages((m) => [...m, { role: "assistant", text: "✓ Mitigation brief ready — see the result below." }]);
      },
    );
    unsubRef.current = unsub;
    return () => {
      unsub();
      unsubRef.current = null;
    };
  }, [threadId]);

  useEffect(() => () => unsubRef.current?.(), []);

  const busy = starting || (!!threadId && !done);

  // Single entry point — used by both free-typed input and scenario chips.
  async function runAlert(alertText: string) {
    const text = alertText.trim();
    if (!text || busy) return;
    setErr(null);
    setStarting(true);
    setInput("");
    setMessages((m) => [
      ...m,
      { role: "user", text },
      { role: "assistant", text: "Parsing your alert and dispatching to the Supervisor agent…" },
    ]);
    try {
      const { thread_id } = await api.startWorkflow({ alert_text: text });
      setThreadId(thread_id);
    } catch (e: any) {
      setErr(`Failed to start workflow: ${e.message}`);
      setMessages((m) => [...m, { role: "assistant", text: "⚠ Couldn't reach the workflow API." }]);
    } finally {
      setStarting(false);
    }
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      runAlert(input);
    }
  }

  async function submitDecision(kind: "approved" | "rejected", comment?: string) {
    if (!threadId || reviewBusy) return;
    setReviewBusy(true);
    setReviewErr(null);
    try {
      await api.decision({ thread_id: threadId, decision: kind, comment });
      setDecision(kind);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: kind === "approved"
            ? "✓ Plan approved — dispatching the reroute for execution."
            : "✕ Plan rejected — your feedback was recorded for the planner.",
        },
      ]);
    } catch (e: any) {
      setReviewErr(`Failed to record decision: ${e.message}`);
    } finally {
      setReviewBusy(false);
    }
  }

  const statuses = deriveStatuses(steps, done);
  const brief = final?.mitigation_brief;
  const rawConf = final?.confidence_score ?? brief?.confidence_score;
  const confidence = rawConf == null ? null : rawConf <= 1 ? Math.round(rawConf * 100) : Math.round(rawConf);
  const action = final?.recommended_action ?? brief?.recommended_action;
  const isAutoExecute = action === "AUTO_EXECUTE";
  const isHumanReview = action === "HUMAN_REVIEW";

  return (
    <Card className="mt-4">
      <SectionTitle
        kicker="Disruption Intake"
        title="Report a Disruption"
        sub="A chat front-end to the autonomous mitigation workflow. Type naturally or pick a scenario."
      />

      {/* Chat interface — transcript, suggestion chips, and composer all inside one surface */}
      <div className="rounded-2xl border border-border/60 bg-surface2/30 p-5 space-y-6">
        {/* Transcript */}
        <div className="space-y-4">
          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-accent/15 border border-accent/30 text-fg"
                    : "bg-surface/70 border border-border/60 text-fg/90"
                }`}
              >
                {m.text}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Suggestion chips — inside the chat, above the composer */}
        <div className="space-y-3">
          <div className="label">Example scenarios — tap to run</div>
          <div className="grid sm:grid-cols-2 gap-3">
            {SCENARIOS.map((text) => (
              <button
                key={text}
                onClick={() => runAlert(text)}
                disabled={busy}
                className="text-left rounded-xl border border-border/70 bg-surface/50 px-4 py-3 text-sm leading-relaxed text-fg/90 hover:border-accent/60 hover:bg-accent/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {text}
              </button>
            ))}
          </div>
        </div>

        {/* Composer pinned at the bottom of the chat surface */}
        <div className="flex items-end gap-3 pt-1">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onInputKeyDown}
            disabled={busy}
            rows={1}
            placeholder="Describe a disruption… e.g. “A typhoon closed Port Klang, Malaysia — SUP-001 can't ship 20 orders.”"
            className="input min-h-[48px] max-h-[140px] resize-y flex-1 disabled:opacity-50"
          />
          <button
            onClick={() => runAlert(input)}
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="shrink-0 h-[48px] w-[48px] grid place-items-center rounded-xl bg-accent text-bg hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? (
              <span className="block h-4 w-4 rounded-full border-2 border-bg/40 border-t-bg animate-spin" />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {err && (
        <div className="card p-3 border-danger/50 bg-danger/10 text-danger text-sm mt-3">{err}</div>
      )}

      {/* Inline workflow — appears on the same page once an alert is dispatched */}
      <AnimatePresence>
        {threadId && (
          <motion.div
            key="workflow"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 space-y-6"
          >
            <div className="text-xs text-mutedfg font-mono">thread {threadId}</div>

            <div className="rounded-xl border border-border/60 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="label">Agent Graph</div>
                <StatusLegend />
              </div>
              <AgentGraph statuses={statuses} />
            </div>

            <div className="rounded-xl border border-border/60 p-5">
              <div className="label mb-3">Live Timeline</div>
              {steps.length === 0 ? (
                <div className="text-mutedfg text-sm">Waiting for agent steps…</div>
              ) : (
                <div className="max-h-[360px] overflow-y-auto pr-1">
                  <Timeline steps={steps} />
                </div>
              )}
            </div>

            {done && final && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-accent/30 bg-accent/5 p-4">
                <div className="label mb-3">Mitigation Brief</div>
                <div className="grid md:grid-cols-4 gap-6 items-center">
                  <div className="flex justify-center">
                    <ConfidenceGauge value={confidence ?? 0} />
                  </div>
                  <div className="md:col-span-3 grid grid-cols-2 gap-4">
                    <Field label="Severity"><SeverityChip severity={final.severity} /></Field>
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

                {/* HUMAN_REVIEW → approve / reject. AUTO_EXECUTE → no action. */}
                {isHumanReview && (
                  <div className="mt-5 border-t border-border/50 pt-4">
                    {decision ? (
                      <div className={`flex items-center gap-2 text-sm font-medium ${
                        decision === "approved" ? "text-accent" : "text-danger"
                      }`}>
                        {decision === "approved" ? "✓ Plan approved" : "✕ Plan rejected"}
                        {decision === "rejected" && reviewComment.trim() && (
                          <span className="text-mutedfg font-normal">— “{reviewComment.trim()}”</span>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="label mb-2">Human Review Required — approve or reject this plan</div>
                        {!showReject ? (
                          <div className="flex flex-wrap gap-3">
                            <button
                              onClick={() => submitDecision("approved")}
                              disabled={reviewBusy}
                              className="btn-primary disabled:opacity-50"
                            >
                              {reviewBusy ? "Submitting…" : "✓ Approve"}
                            </button>
                            <button
                              onClick={() => setShowReject(true)}
                              disabled={reviewBusy}
                              className="rounded-xl border border-danger/50 bg-danger/10 text-danger px-4 py-2 text-sm font-medium hover:bg-danger/20 transition-colors disabled:opacity-50"
                            >
                              ✕ Reject
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <textarea
                              value={reviewComment}
                              onChange={(e) => setReviewComment(e.target.value)}
                              rows={3}
                              autoFocus
                              placeholder="Why are you rejecting this plan? Add feedback for the planner…"
                              className="input min-h-[80px] resize-y w-full"
                            />
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => submitDecision("rejected", reviewComment)}
                                disabled={reviewBusy || !reviewComment.trim()}
                                className="rounded-xl border border-danger/50 bg-danger/10 text-danger px-4 py-2 text-sm font-medium hover:bg-danger/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {reviewBusy ? "Submitting…" : "Submit rejection"}
                              </button>
                              <button
                                onClick={() => { setShowReject(false); setReviewComment(""); }}
                                disabled={reviewBusy}
                                className="rounded-xl border border-border/70 px-4 py-2 text-sm text-mutedfg hover:text-fg hover:border-border transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                        {reviewErr && <div className="text-danger text-sm mt-2">{reviewErr}</div>}
                      </>
                    )}
                  </div>
                )}

                {isAutoExecute && (
                  <div className="mt-5 border-t border-border/50 pt-4 text-xs text-mutedfg">
                    ✓ Auto-executed — no action required.
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function StatusLegend() {
  const items = [
    { c: "#475569", t: "Not started" },
    { c: "#38BDF8", t: "In progress", blink: true },
    { c: "#22C55E", t: "Complete" },
  ];
  return (
    <div className="flex items-center gap-3">
      {items.map((it) => (
        <span key={it.t} className="flex items-center gap-1.5 text-xs text-mutedfg">
          <span
            className={`h-2.5 w-2.5 rounded-full ${it.blink ? "animate-pulse" : ""}`}
            style={{ background: it.c }}
          />
          {it.t}
        </span>
      ))}
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
