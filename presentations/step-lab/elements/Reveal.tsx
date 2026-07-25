import type { ReactNode } from "react";
import { Step } from "@liebstoeckel/engine";

// A numbered reveal. The number is the point: when you enter a slide backwards
// every one of them should already be on screen, and each Left press should take
// the highest-numbered one away.
export function Reveal({ n, children }: { n: number; children: ReactNode }) {
  return (
    <Step>
      <div className="flex items-baseline gap-4 rounded-xl border border-border bg-surface/30 px-5 py-3">
        <span className="font-mono text-sm text-accent">{String(n).padStart(2, "0")}</span>
        <span className="font-body text-2xl text-text">{children}</span>
      </div>
    </Step>
  );
}

// The heading every lab slide shares, so it is obvious which one you are on and
// what it is meant to exercise.
export function Lab({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center gap-3 font-mono text-sm uppercase tracking-[0.35em] text-accent">
        <span className="h-px w-8 bg-accent" />
        slide {n}
      </div>
      <h2 className="font-heading text-5xl font-semibold tracking-[-0.02em] text-text">{title}</h2>
      <p className="mt-3 font-body text-xl text-muted">{sub}</p>
    </div>
  );
}
