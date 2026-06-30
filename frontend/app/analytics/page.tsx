"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from "recharts";
import { api } from "@/lib/api";
import { SectionTitle, spotlightMove } from "@/components/ui";
import { CopyButton } from "@/components/CopyButton";

const PAL = ["#22C55E", "#14B8A6", "#3B82F6", "#F59E0B", "#A855F7", "#EF4444", "#06B6D4", "#84CC16"];
const AXIS = { stroke: "#5E6B86", fontSize: 11 };
const tip = {
  contentStyle: { background: "#0B1120", border: "1px solid #334155", borderRadius: 10, fontSize: 12 },
  labelStyle: { color: "#F4F8FF" }, itemStyle: { color: "#94A3B8" },
};

function esgLabel(b: any) { return b === 0 ? "At-Risk (<60)" : b === 60 ? "OK (60–79)" : b === 80 ? "Strong (≥80)" : String(b); }

function ChartCard({ title, kicker, ds, children }: any) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="card spotlight p-5 transition-transform duration-300 hover:-translate-y-1"
      onPointerMove={spotlightMove}
    >
      <div className="flex items-start justify-between">
        <SectionTitle kicker={kicker} title={title} />
        <button
          className="btn-ghost text-xs px-2.5 py-1 transition-all duration-300 hover:scale-105 hover:border-accent/60 hover:text-accent"
          onClick={() => setOpen(o => !o)}
        >
          {open ? "Hide" : "Pipeline"}
        </button>
      </div>
      <div style={{ width: "100%", height: 240 }}>{children}</div>
      {open && ds && (
        <div className="mt-3 relative">
          <div className="absolute right-2 top-2 z-10">
            <CopyButton text={`db.${ds.collection}.aggregate(${JSON.stringify(ds.pipeline, null, 2)})`} />
          </div>
          <pre className="bg-bg border border-border rounded-lg p-3 overflow-auto text-[11px] font-mono text-fg/80 max-h-40">
{`db.${ds.collection}.aggregate(\n${JSON.stringify(ds.pipeline, null, 2)}\n)`}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function Analytics() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.chartsSummary().then(setD).catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="card p-4 border-danger/50 bg-danger/10 text-danger text-sm">{err}</div>;
  if (!d) return <div className="text-mutedfg">Loading charts…</div>;

  const esg = (d.esg_distribution.data || []).map((x: any) => ({ name: esgLabel(x.bucket), value: x.value }));

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <div className="label">Analytics · powered by MongoDB aggregation</div>
        <h1 className="text-3xl font-bold">Charts &amp; Insights</h1>
        <p className="text-sm text-mutedfg mt-1">Bar, pie, donut & horizontal-bar views over live collections. Click “Pipeline” on any chart to see the MongoDB query.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <ChartCard kicker="suppliers" title="Suppliers by Region" ds={d.suppliers_by_region}>
            <ResponsiveContainer>
              <BarChart data={d.suppliers_by_region.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1A1E2F" />
                <XAxis dataKey="name" {...AXIS} /><YAxis {...AXIS} allowDecimals={false} />
                <Tooltip {...tip} cursor={{ fill: "rgba(255,255,255,.04)" }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {d.suppliers_by_region.data.map((_: any, i: number) => <Cell key={i} fill={PAL[i % PAL.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .05 }}>
          <ChartCard kicker="compliance" title="ESG Distribution" ds={d.esg_distribution}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={esg} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                  {esg.map((_: any, i: number) => <Cell key={i} fill={[ "#EF4444", "#F59E0B", "#22C55E"][i] || PAL[i]} />)}
                </Pie>
                <Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 11, color: "#94A3B8" }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .1 }}>
          <ChartCard kicker="capacity" title="Capacity by Supplier" ds={d.capacity_by_supplier}>
            <ResponsiveContainer>
              <BarChart data={d.capacity_by_supplier.data} layout="vertical" margin={{ left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1A1E2F" />
                <XAxis type="number" {...AXIS} /><YAxis type="category" dataKey="name" width={120} {...AXIS} />
                <Tooltip {...tip} cursor={{ fill: "rgba(255,255,255,.04)" }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} fill="#14B8A6" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .15 }}>
          <ChartCard kicker="blast radius" title="Units at Risk by Supplier" ds={d.units_at_risk_by_supplier}>
            <ResponsiveContainer>
              <BarChart data={d.units_at_risk_by_supplier.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1A1E2F" />
                <XAxis dataKey="name" {...AXIS} /><YAxis {...AXIS} />
                <Tooltip {...tip} cursor={{ fill: "rgba(255,255,255,.04)" }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#EF4444" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .2 }}>
          <ChartCard kicker="policies" title="Policy Chunks by Type" ds={d.policies_by_type}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={d.policies_by_type.data} dataKey="value" nameKey="name" outerRadius={90} label>
                  {d.policies_by_type.data.map((_: any, i: number) => <Cell key={i} fill={PAL[i % PAL.length]} />)}
                </Pie>
                <Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 11, color: "#94A3B8" }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .25 }}>
          <ChartCard kicker="governance" title="Audit Events by Agent" ds={d.audit_by_agent}>
            <ResponsiveContainer>
              <BarChart data={d.audit_by_agent.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1A1E2F" />
                <XAxis dataKey="name" {...AXIS} interval={0} angle={-18} textAnchor="end" height={48} />
                <YAxis {...AXIS} />
                <Tooltip {...tip} cursor={{ fill: "rgba(255,255,255,.04)" }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#A855F7" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </motion.div>
      </div>

      <div className="mt-4">
        <ChartCard kicker="decisions" title="Mitigation Plan Actions (AUTO vs Human Review)" ds={d.plan_actions}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={d.plan_actions.data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                {d.plan_actions.data.map((x: any, i: number) =>
                  <Cell key={i} fill={x.name === "AUTO_EXECUTE" ? "#22C55E" : "#F59E0B"} />)}
              </Pie>
              <Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 11, color: "#94A3B8" }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
