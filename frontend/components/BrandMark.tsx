"use client";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Animated ResilioChain brand mark: a gradient resilience shield with a
 * self-drawing checkmark, a breathing glow, and a periodic shine sweep.
 * Honors prefers-reduced-motion (falls back to a clean static shield+check).
 */
const SHIELD =
  "M24 3 L41 9.5 V23.5 C41 34 33.6 41.4 24 45 C14.4 41.4 7 34 7 23.5 V9.5 Z";
const CHECK = "M16.5 24.5 L21.5 29.5 L32 17.5";

export function BrandMark({ size = 40 }: { size?: number }) {
  const reduce = useReducedMotion();

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="ResilioChain"
      initial="rest"
      animate="rest"
      whileHover="hover"
      style={{ overflow: "visible", display: "block" }}
    >
      <defs>
        <linearGradient id="bm-stroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3DF5A4" />
          <stop offset="0.55" stopColor="#22C55E" />
          <stop offset="1" stopColor="#0FB5A6" />
        </linearGradient>
        <linearGradient id="bm-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#22C55E" stopOpacity="0.30" />
          <stop offset="1" stopColor="#0FB5A6" stopOpacity="0.05" />
        </linearGradient>
        <radialGradient id="bm-glow" cx="50%" cy="42%" r="60%">
          <stop offset="0" stopColor="#22F58E" stopOpacity="0.6" />
          <stop offset="1" stopColor="#22F58E" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bm-shine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.55" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <clipPath id="bm-clip">
          <path d={SHIELD} />
        </clipPath>
      </defs>

      {/* breathing glow */}
      <motion.ellipse
        cx="24"
        cy="24"
        rx="21"
        ry="22"
        fill="url(#bm-glow)"
        animate={reduce ? { opacity: 0.5 } : { opacity: [0.4, 0.9, 0.4], scale: [0.9, 1.05, 0.9] }}
        transition={{ duration: 2.8, repeat: reduce ? 0 : Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "24px 24px" }}
      />

      <motion.g
        variants={{ rest: { scale: 1, rotate: 0 }, hover: { scale: 1.08, rotate: -3 } }}
        transition={{ type: "spring", stiffness: 300, damping: 16 }}
        style={{ transformOrigin: "24px 24px" }}
      >
        {/* shield */}
        <path
          d={SHIELD}
          fill="url(#bm-fill)"
          stroke="url(#bm-stroke)"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />

        {/* checkmark */}
        {reduce ? (
          <path d={CHECK} fill="none" stroke="url(#bm-stroke)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <motion.path
            d={CHECK}
            fill="none"
            stroke="url(#bm-stroke)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            animate={{ pathLength: [0, 1, 1, 0], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 3.6, times: [0, 0.3, 0.82, 1], repeat: Infinity, ease: "easeInOut" }}
          />
        )}

        {/* shine sweep, clipped to the shield */}
        {!reduce && (
          <g clipPath="url(#bm-clip)">
            <g transform="skewX(-18)">
              <motion.rect
                y="-4"
                width="9"
                height="56"
                fill="url(#bm-shine)"
                animate={{ x: [-16, 56] }}
                transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 1.6, ease: "easeInOut" }}
              />
            </g>
          </g>
        )}
      </motion.g>
    </motion.svg>
  );
}
