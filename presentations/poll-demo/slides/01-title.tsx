import { motion } from "motion/react";
import { Step } from "@liebstoeckel/engine";

export const notes = (
  <div>
    <p>Open. Press <kbd>→</kbd> to reveal each point in turn — the presenter view shows the step counter.</p>
    <ul>
      <li>Then advance to the <strong>live poll</strong>.</li>
      <li>Audience scans the QR (press <kbd>Q</kbd>) and votes from their phones.</li>
    </ul>
  </div>
);

export default function Title() {
  return (
    <div className="w-full">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-5 flex items-center gap-3 font-mono text-sm uppercase tracking-[0.35em] text-accent"
      >
        <span className="h-px w-8 bg-accent" />
        liebstoeckel · live
      </motion.div>
      <h1
        className="font-heading text-[92px] font-semibold leading-[0.95] tracking-[-0.03em] text-text"
        style={{ fontVariationSettings: '"opsz" 144' }}
      >
        Decks that <span className="italic text-primary">talk back</span>.
      </h1>
      <div className="mt-10 space-y-4 font-body text-2xl text-muted">
        <Step>▹ Plugins are real Bun packages — client + optional server.</Step>
        <Step>▹ State is shared live over a CRDT (Yjs).</Step>
        <Step>▹ Everyone — even read-only viewers — can interact.</Step>
      </div>
    </div>
  );
}
