"use client";

export type SupplierClass =
  | "IMPACTED" | "GOOD" | "ALTERNATIVE" | "RISKY" | "COMPLIANCE_BLOCKED" | "NEUTRAL";

const MAP: Record<SupplierClass, { label: string; cls: string }> = {
  IMPACTED: { label: "Impacted", cls: "border-danger/50 text-danger bg-danger/10" },
  GOOD: { label: "Good / Available", cls: "border-accent/50 text-accent bg-accent/10" },
  ALTERNATIVE: { label: "Alternative", cls: "border-info/50 text-info bg-info/10" },
  RISKY: { label: "Risky", cls: "border-warn/50 text-warn bg-warn/10" },
  COMPLIANCE_BLOCKED: { label: "Compliance-Blocked", cls: "border-danger/60 text-danger bg-danger/15" },
  NEUTRAL: { label: "Not Impacted", cls: "border-border text-mutedfg bg-muted/40" },
};

export function SupplierBadge({ kind }: { kind: SupplierClass }) {
  const m = MAP[kind];
  return <span className={`chip ${m.cls}`}>{m.label}</span>;
}

export function EsgPill({ score }: { score: number }) {
  const cls = score >= 60 ? "text-accent" : "text-danger";
  return <span className={`font-mono font-semibold ${cls}`}>{score}</span>;
}
