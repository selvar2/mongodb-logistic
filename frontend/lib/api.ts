// Typed client for the ResilioChain FastAPI backend (+ SSE helper).
import type { StepEvent, WorkflowState } from "./types";

// Resolve the backend base URL.
//  1. An explicit NEXT_PUBLIC_API_BASE always wins (set it to pin a host).
//  2. In a browser on a GitHub Codespaces forwarded host
//     (<name>-3000.app.github.dev) derive the sibling backend port host
//     (<name>-8010.app.github.dev) — no hardcoded Codespace name needed.
//  3. Otherwise fall back to localhost:8010 (local dev + in-Codespace SSR).
function resolveApiBase(): string {
  const explicit = process.env.NEXT_PUBLIC_API_BASE;
  if (explicit) return explicit;
  if (typeof window !== "undefined") {
    const { hostname, protocol } = window.location;
    const m = hostname.match(/^(.*)-3000\.(.+)$/);
    if (m) return `${protocol}//${m[1]}-8010.${m[2]}`;
  }
  return "http://localhost:8010";
}

export const API_BASE = resolveApiBase();

async function jget<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
  return r.json();
}
async function jpost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${path} → ${r.status}`);
  return r.json();
}

export const api = {
  health: () => jget<any>("/health"),
  suppliers: () => jget<{ count: number; items: any[] }>("/suppliers"),
  orders: (supplier_id?: string) =>
    jget<{ count: number; items: any[] }>(
      `/orders${supplier_id ? `?supplier_id=${supplier_id}` : ""}`,
    ),
  policies: () => jget<{ count: number; items: any[] }>("/policies"),
  pipelines: () => jget<Record<string, any>>("/pipelines"),
  auditLogs: (thread_id?: string) =>
    jget<{ count: number; items: any[] }>(
      `/audit-logs${thread_id ? `?thread_id=${thread_id}` : ""}`,
    ),
  observability: () => jget<any>("/observability"),
  graphragExtract: (text: string) => jpost<any>("/graphrag/extract", { text }),
  graphragAsk: (question: string) => jpost<any>("/graphrag/ask", { question }),
  graphragGraph: () => jget<any>("/graphrag/graph"),
  evalRun: () => jpost<any>("/evaluation/run", {}),
  evalLatest: () => jget<any>("/evaluation/latest"),
  evalHistory: () => jget<any>("/evaluation/history"),
  chartsSummary: () => jget<any>("/charts/summary"),
  disruptions: () => jget<{ count: number; items: any[] }>("/disruptions"),
  createDisruption: (body: any) => jpost<any>("/disruptions", body),
  runWorkflow: (body: { alert_text?: string; disruption_id?: string }) =>
    jpost<WorkflowState>("/workflow/run", body),
  startWorkflow: (body: { alert_text?: string; disruption_id?: string }) =>
    jpost<{ thread_id: string; status: string }>("/workflow/start", body),
  decision: (body: { thread_id: string; decision: "approved" | "rejected"; comment?: string }) =>
    jpost<{ ok: boolean; decision: string; plan_updated: boolean }>("/workflow/decision", body),
  result: (thread_id: string) => jget<WorkflowState>(`/workflow/result/${thread_id}`),
  plans: (thread_id: string) =>
    jget<{ count: number; items: any[] }>(`/plans/${thread_id}`),
};

/**
 * Subscribe to the SSE stream for a workflow thread.
 * Calls onStep for each agent step and onDone with the final state.
 * Returns an unsubscribe function.
 */
export function streamWorkflow(
  thread_id: string,
  onStep: (s: StepEvent) => void,
  onDone: (final: WorkflowState) => void,
): () => void {
  const es = new EventSource(`${API_BASE}/workflow/stream/${thread_id}`);
  es.addEventListener("step", (e) => {
    try {
      onStep(JSON.parse((e as MessageEvent).data));
    } catch {}
  });
  es.addEventListener("done", (e) => {
    try {
      onDone(JSON.parse((e as MessageEvent).data));
    } catch {}
    es.close();
  });
  es.onerror = () => es.close();
  return () => es.close();
}
