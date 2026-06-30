"use client";
import { ReactNode, PointerEvent, useEffect, useRef, useState } from "react";

/** Feeds the cursor-follow spotlight: sets --mx/--my on the hovered element.
 *  Pair with the `.spotlight` class (see globals.css). */
export function spotlightMove(e: PointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
  el.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card p-5 ${className}`}>{children}</div>;
}

export function SectionTitle({ kicker, title, sub }: { kicker?: string; title: string; sub?: string }) {
  return (
    <div className="mb-4">
      {kicker && <div className="label mb-1">{kicker}</div>}
      <h2 className="text-xl font-semibold text-fg">{title}</h2>
      {sub && <p className="text-sm text-mutedfg mt-1">{sub}</p>}
    </div>
  );
}

export function Stat({ label, value, hint, tone = "fg" }: {
  label: string; value: ReactNode; hint?: string;
  tone?: "fg" | "accent" | "warn" | "danger" | "info";
}) {
  const toneClass = {
    fg: "text-fg", accent: "text-accent", warn: "text-warn",
    danger: "text-danger", info: "text-info",
  }[tone];
  const [runId, setRunId] = useState(0);
  const isNum = typeof value === "number";
  return (
    <div
      className="card spotlight p-4 transition-transform duration-300 hover:-translate-y-1"
      onPointerMove={spotlightMove}
      onPointerEnter={() => isNum && setRunId((v) => v + 1)}
    >
      <div className="label">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${toneClass}`}>
        {isNum ? <CountUp value={value as number} runId={runId} /> : value}
      </div>
      {hint && <div className="text-xs text-mutedfg mt-1">{hint}</div>}
    </div>
  );
}

/** Counts from 0 up to `value` whenever `runId` changes (i.e. on hover).
 *  Before the first hover (runId 0) it just shows the live value. */
function CountUp({ value, runId }: { value: number; runId: number }) {
  const [display, setDisplay] = useState(value);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    if (runId === 0) { setDisplay(value); return; }
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof performance === "undefined") { setDisplay(value); return; }
    const dur = 650;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setDisplay(Math.round(value * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [runId, value]);
  return <>{display}</>;
}

const severityTone: Record<string, string> = {
  LOW: "border-info/40 text-info bg-info/10",
  MEDIUM: "border-warn/40 text-warn bg-warn/10",
  HIGH: "border-danger/40 text-danger bg-danger/10",
  CRITICAL: "border-danger/60 text-danger bg-danger/20",
};
export function SeverityChip({ severity }: { severity?: string }) {
  const t = severityTone[severity || "HIGH"] || severityTone.HIGH;
  return <span className={`chip ${t}`}>{severity || "—"}</span>;
}

export function ActionChip({ action }: { action?: string }) {
  const auto = action === "AUTO_EXECUTE";
  return (
    <span className={`chip ${auto ? "border-accent/50 text-accent bg-accent/10" : "border-warn/50 text-warn bg-warn/10"}`}>
      {auto ? "✓ Auto-Execute" : "⚠ Human Review"}
    </span>
  );
}

export function levelDot(level: string) {
  return level === "warn" ? "bg-warn" : level === "error" ? "bg-danger" : "bg-accent";
}

export function fmtUSD(n?: number) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
export function fmtNum(n?: number) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}
