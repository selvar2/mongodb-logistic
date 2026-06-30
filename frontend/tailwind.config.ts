import type { Config } from "tailwindcss";

// Palette from UI/UX Pro Max — "Financial Dashboard" dark enterprise system.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#020617",
        surface: "#0E1223",
        surface2: "#0F172A",
        muted: "#1A1E2F",
        mutedfg: "#94A3B8",
        border: "#334155",
        fg: "#F8FAFC",
        primary: "#0F172A",
        accent: "#22C55E",
        accent2: "#14B8A6",
        warn: "#F59E0B",
        danger: "#EF4444",
        info: "#3B82F6",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)",
        glow: "0 0 0 1px rgba(34,197,94,0.25), 0 0 24px -6px rgba(34,197,94,0.35)",
      },
      keyframes: {
        pulseGlow: {
          "0%,100%": { boxShadow: "0 0 0 0 rgba(34,197,94,0.0)" },
          "50%": { boxShadow: "0 0 0 4px rgba(34,197,94,0.15)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        pulseGlow: "pulseGlow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
