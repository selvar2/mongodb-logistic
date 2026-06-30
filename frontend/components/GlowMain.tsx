"use client";
import { ReactNode } from "react";
import { spotlightMove } from "@/components/ui";

/** Main content area with a cursor-follow glow that shows through the empty
 *  space around/below page content. Cards on top render their own spotlight. */
export function GlowMain({ children }: { children: ReactNode }) {
  return (
    <main
      onPointerMove={spotlightMove}
      className="glow-area flex-1 min-w-0 px-8 py-6"
    >
      {children}
    </main>
  );
}
