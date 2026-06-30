"use client";
import { ReactNode } from "react";

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
  return (
    <div className="card p-4">
      <div className="label">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${toneClass}`}>{value}</div>
      {hint && <div className="text-xs text-mutedfg mt-1">{hint}</div>}
    </div>
  );
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
