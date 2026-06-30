"use client";
import { motion, AnimatePresence } from "framer-motion";
import { levelDot } from "./ui";
import type { StepEvent } from "@/lib/types";

export function Timeline({ steps }: { steps: StepEvent[] }) {
  return (
    <div className="relative pl-5">
      <div className="absolute left-[6px] top-1 bottom-1 w-px bg-border" />
      <AnimatePresence initial={false}>
        {steps.map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25 }}
            className="relative mb-4"
          >
            <span className={`absolute -left-[14px] top-1.5 w-2.5 h-2.5 rounded-full ${levelDot(s.level)}`} />
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-accent2 uppercase tracking-wide">{s.agent}</span>
              <span className="text-[10px] text-mutedfg">{s.action}</span>
            </div>
            <div className={`text-sm ${s.level === "warn" ? "text-warn" : "text-fg/90"}`}>{s.summary}</div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
