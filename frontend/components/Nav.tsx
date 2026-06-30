"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { spotlightMove } from "@/components/ui";

const LINKS = [
  { href: "/", label: "Dashboard", icon: "▣" },
  { href: "/analytics", label: "Analytics", icon: "📊" },
  { href: "/intake", label: "Disruption Intake", icon: "⚠" },
  { href: "/classification", label: "Supplier Impact", icon: "◈" },
  { href: "/sourcing", label: "Alternative Sourcing", icon: "⊕" },
  { href: "/workflow", label: "Agent Workflow", icon: "⟳" },
  { href: "/brief", label: "Mitigation Brief", icon: "▤" },
  { href: "/data-explorer", label: "MongoDB Explorer", icon: "⛁" },
  { href: "/audit", label: "Audit Logs", icon: "❒" },
  { href: "/observability", label: "Observability", icon: "📈" },
  { href: "/graphrag", label: "GraphRAG", icon: "🕸" },
  { href: "/evaluation", label: "Evaluation", icon: "✅" },
  { href: "/docs", label: "Documentation", icon: "❖" },
];

// Hidden from the sidebar for the focused demo (the pages still work by URL).
// To restore a link, remove its href from this set.
const HIDDEN = new Set<string>([
  "/intake", "/classification", "/sourcing", "/workflow", "/brief",
  "/data-explorer", "/audit", "/observability", "/graphrag", "/evaluation", "/docs",
]);
const VISIBLE_LINKS = LINKS.filter((l) => !HIDDEN.has(l.href));

export function Nav() {
  const path = usePathname();
  return (
    <aside
      onPointerMove={spotlightMove}
      className="glow-area w-[240px] shrink-0 h-screen sticky top-0 border-r border-border/70 bg-surface/60 backdrop-blur flex flex-col"
    >
      <div className="px-5 py-5 border-b border-border/70">
        <div className="flex items-center gap-3">
          <BrandMark size={38} />
          <div>
            <div className="font-bold text-fg leading-tight">ResilioChain</div>
            <div className="text-[10px] uppercase tracking-widest text-mutedfg">Supply-Chain AI</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-3">
        {VISIBLE_LINKS.map((l) => {
          const active = path === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              onPointerMove={spotlightMove}
              className={`spotlight group flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm transition-all duration-300 hover:-translate-y-px ${
                active
                  ? "text-accent bg-accent/10 font-semibold"
                  : "text-mutedfg hover:text-fg hover:bg-muted/50"
              }`}
            >
              <span className="w-4 text-center opacity-80 transition-transform duration-300 group-hover:scale-125">{l.icon}</span>
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-3 border-t border-border/70 text-[10px] text-mutedfg">
        MongoDB Atlas · LangGraph · Bedrock
      </div>
    </aside>
  );
}
