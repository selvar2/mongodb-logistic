"use client";
import { motion } from "framer-motion";

export function ConfidenceGauge({ value, threshold = 85 }: { value: number; threshold?: number }) {
  const r = 52, c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  const color = value >= threshold ? "#22C55E" : value >= 60 ? "#F59E0B" : "#EF4444";
  return (
    <div className="relative w-[140px] h-[140px]">
      <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#1A1E2F" strokeWidth="12" />
        <motion.circle
          cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="12"
          strokeLinecap="round" strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 1.1, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className="text-3xl font-bold" style={{ color }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
        >
          {Math.round(value)}
        </motion.span>
        <span className="text-[10px] uppercase tracking-wider text-mutedfg">confidence</span>
      </div>
    </div>
  );
}
