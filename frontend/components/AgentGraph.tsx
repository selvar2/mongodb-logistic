"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

export type AgentStatus = "idle" | "active" | "done" | "fail";

type Node = { id: string; label: string; tool: string; desc: string; x: number };
const W = 178, H = 80, Y = 86, STEP = 198, X0 = 14;
const NODES: Node[] = [
  { id: "supervisor", label: "Supervisor", tool: "classify · route",
    desc: "Classifies severity & routes the squad; makes the final HITL decision.", x: X0 + 0 * STEP },
  { id: "impact_assessor", label: "Impact Assessor", tool: "$graphLookup",
    desc: "Computes the blast radius via $graphLookup over the order→supplier graph.", x: X0 + 1 * STEP },
  { id: "sourcing", label: "Sourcing", tool: "$vectorSearch",
    desc: "Finds backup suppliers via $vectorSearch, hard-filtered by capacity.", x: X0 + 2 * STEP },
  { id: "compliance", label: "Compliance", tool: "Vector RAG",
    desc: "Vets ESG / sanctions via Vector RAG; loops back to sourcing on fail.", x: X0 + 3 * STEP },
  { id: "planner", label: "Mitigation Planner", tool: "write_plan",
    desc: "Deterministic confidence score, then writes the mitigation plan.", x: X0 + 4 * STEP },
];
const pos = Object.fromEntries(NODES.map((n) => [n.id, n])) as Record<string, Node>;
const EDGES: [string, string][] = [
  ["supervisor", "impact_assessor"], ["impact_assessor", "sourcing"],
  ["sourcing", "compliance"], ["compliance", "planner"],
];

const C = {
  idle: "#475569",   // grey — not yet started
  active: "#3B82F6", // blue, blinking — in progress
  done: "#22C55E",   // green — complete
  fail: "#EF4444",   // red — compliance fail
};
const statusColor = (s: AgentStatus = "idle") => C[s];
const flowing = (s: AgentStatus = "idle") => s === "active" || s === "done";

function Icon({ id, color }: { id: string; color: string }) {
  // minimalist line glyphs (no emoji) — drawn at node's left, 18x18 around (cx,cy)
  const p = { stroke: color, strokeWidth: 1.6, fill: "none", strokeLinecap: "round" as const };
  switch (id) {
    case "supervisor": return (<g {...p}><circle cx="0" cy="0" r="3.2" /><path d="M0,-8 V-4 M0,4 V8 M-8,0 H-4 M4,0 H8" /></g>);
    case "impact_assessor": return (<g {...p}><circle cx="-6" cy="4" r="2.4" /><circle cx="6" cy="4" r="2.4" /><circle cx="0" cy="-6" r="2.4" /><path d="M-4.5,2.5 L-1,-4 M4.5,2.5 L1,-4 M-4,4 H4" /></g>);
    case "sourcing": return (<g {...p}><circle cx="-2" cy="-2" r="5" /><path d="M2,2 L7,7" /></g>);
    case "compliance": return (<g {...p}><path d="M0,-8 L7,-5 V1 C7,5 4,7 0,8 C-4,7 -7,5 -7,1 V-5 Z" /><path d="M-3,0 L-1,2.5 L3.5,-3" /></g>);
    case "planner": return (<g {...p}><rect x="-6" y="-8" width="12" height="16" rx="1.6" /><path d="M-3,-4 H3 M-3,0 H3 M-3,4 H1" /></g>);
    default: return null;
  }
}

export function AgentGraph({ statuses }: { statuses: Record<string, AgentStatus> }) {
  const [hover, setHover] = useState<string | null>(null);
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const m = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    setReduce(!!m?.matches);
  }, []);

  const edgePath = (a: Node, b: Node) => {
    const x1 = a.x + W, x2 = b.x, y = Y + H / 2;
    const mx = (x1 + x2) / 2;
    return `M ${x1},${y} C ${mx},${y} ${mx},${y} ${x2},${y}`;
  };
  const retryPath = () => {
    const a = pos["compliance"], b = pos["sourcing"];
    const x1 = a.x + W / 2, x2 = b.x + W / 2, y0 = Y + H;
    return `M ${x1},${y0} C ${x1},${y0 + 56} ${x2},${y0 + 56} ${x2},${y0}`;
  };
  const complianceFail = statuses["compliance"] === "fail";

  return (
    <div className="relative w-full overflow-hidden rounded-xl">
      {/* ambient backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(600px 200px at 30% 0%, rgba(34,197,94,.07), transparent 60%)," +
            "radial-gradient(500px 200px at 90% 100%, rgba(20,184,166,.06), transparent 60%)",
        }} />
      <svg viewBox="0 0 1000 230" className="relative w-full" style={{ maxHeight: 460 }}>
        <defs>
          <linearGradient id="ag-node" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#141C30" /><stop offset="1" stopColor="#0A1020" />
          </linearGradient>
          <linearGradient id="ag-edge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#22C55E" /><stop offset="1" stopColor="#14B8A6" />
          </linearGradient>
          <filter id="ag-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <marker id="ag-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#475569" />
          </marker>
        </defs>

        {/* edges */}
        {EDGES.map(([a, b], i) => {
          const A = pos[a], B = pos[b];
          const on = flowing(statuses[a]);
          const hot = hover === a || hover === b;
          const d = edgePath(A, B);
          return (
            <g key={i}>
              <path id={`ag-edge-${i}`} d={d} fill="none"
                stroke={on ? "url(#ag-edge)" : "#28324A"}
                strokeWidth={hot ? 3 : 2} opacity={on ? 1 : hot ? 0.8 : 0.5}
                markerEnd="url(#ag-arrow)" />
              {on && !reduce && (
                <circle r="3.4" fill="#9DF6C9">
                  <animateMotion dur="1.5s" repeatCount="indefinite" rotate="auto">
                    <mpath href={`#ag-edge-${i}`} />
                  </animateMotion>
                </circle>
              )}
            </g>
          );
        })}

        {/* retry arc */}
        <path id="ag-retry" d={retryPath()} fill="none" stroke="#F59E0B"
          strokeWidth="1.6" strokeDasharray="5 5"
          opacity={complianceFail ? 1 : 0.3} markerEnd="url(#ag-arrow)" />
        {complianceFail && !reduce && (
          <circle r="3" fill="#FBBF24">
            <animateMotion dur="1.2s" repeatCount="indefinite"><mpath href="#ag-retry" /></animateMotion>
          </circle>
        )}
        <text x={(pos["compliance"].x + pos["sourcing"].x) / 2 + W / 2} y={Y + H + 50}
          textAnchor="middle" fill="#F59E0B" fontSize="10" fontFamily="var(--font-sans)">
          retry ≤3 (ESG fail)
        </text>

        {/* nodes */}
        {NODES.map((n) => {
          const s = statuses[n.id] || "idle";
          const col = statusColor(s);
          const active = s === "active";
          return (
            <motion.g key={n.id} style={{ cursor: "default" }}
              onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}
              initial={false} whileHover={{ scale: 1.035 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}>
              {/* glow ring */}
              <motion.rect x={n.x - 1.5} y={Y - 1.5} width={W + 3} height={H + 3} rx={13}
                fill="none" stroke={col} strokeWidth={s === "idle" ? 1 : 2}
                filter={s === "idle" ? undefined : "url(#ag-glow)"}
                animate={active && !reduce ? { opacity: [0.4, 1, 0.4] } : { opacity: s === "idle" ? 0.5 : 0.9 }}
                transition={{ duration: 1.6, repeat: active && !reduce ? Infinity : 0 }} />
              {/* body */}
              <rect x={n.x} y={Y} width={W} height={H} rx={12} fill="url(#ag-node)"
                stroke="rgba(255,255,255,0.08)" />
              {/* left accent */}
              <rect x={n.x} y={Y} width={4} height={H} rx={2} fill={col} opacity={0.9} />
              {/* icon */}
              <g transform={`translate(${n.x + 26}, ${Y + H / 2})`}><Icon id={n.id} color={col} /></g>
              {/* text */}
              <text x={n.x + 46} y={Y + 34} fill="#F4F8FF" fontSize="15" fontWeight={600}
                fontFamily="var(--font-sans)">{n.label}</text>
              <text x={n.x + 46} y={Y + 54} fill="#8A97B2" fontSize="12"
                fontFamily="ui-monospace, monospace">{n.tool}</text>
              {/* status dot */}
              <circle cx={n.x + W - 14} cy={Y + 18} r="4.5" fill={col}>
                {active && !reduce && <animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite" />}
              </circle>
            </motion.g>
          );
        })}

        {/* hover tooltip */}
        {hover && (() => {
          const n = pos[hover];
          const tw = 230, tx = Math.min(Math.max(n.x + W / 2 - tw / 2, 8), 1000 - tw - 8), ty = Y - 64;
          return (
            <g pointerEvents="none">
              <rect x={tx} y={ty} width={tw} height={52} rx={8} fill="#0B1120"
                stroke="rgba(255,255,255,0.12)" filter="url(#ag-glow)" opacity={0.98} />
              <text x={tx + 12} y={ty + 20} fill="#F4F8FF" fontSize="11.5" fontWeight={600}
                fontFamily="var(--font-sans)">{n.label}</text>
              <text x={tx + 12} y={ty + 38} fill="#94A3B8" fontSize="10" fontFamily="var(--font-sans)">
                {n.desc.length > 46 ? n.desc.slice(0, 46) + "…" : n.desc}
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
