"use client";
import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn-ghost text-xs px-2.5 py-1"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {}
      }}
    >
      {done ? "✓ Copied" : label}
    </button>
  );
}

export function CodeBlock({ code, lang = "" }: { code: string; lang?: string }) {
  return (
    <div className="relative group">
      <div className="absolute right-2 top-2 opacity-80">
        <CopyButton text={code} />
      </div>
      {lang && <div className="label px-3 pt-2">{lang}</div>}
      <pre className="bg-bg border border-border rounded-lg p-3 overflow-auto text-xs font-mono text-fg/90">
        <code>{code}</code>
      </pre>
    </div>
  );
}
