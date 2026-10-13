import { JoinCard } from "@liebstoeckel/engine";

export const notes =
  "Close: the same .html runs standalone (poll shows its fallback) or live (full interaction). One artifact, two modes. Late arrivals can still scan the join card.";

export default function Outro() {
  return (
    <div className="flex h-full w-full items-center gap-16">
      <div className="min-w-0 flex-1">
        <div className="mb-5 flex items-center gap-3 font-mono text-sm uppercase tracking-[0.35em] text-accent">
          <span className="h-px w-8 bg-accent" />
          Fin
        </div>
        <h2
          className="font-heading text-[80px] font-semibold leading-[0.95] tracking-[-0.03em] text-text"
          style={{ fontVariationSettings: '"opsz" 144' }}
        >
          One file. <span className="italic text-primary">Two modes.</span>
        </h2>
        <p className="mt-7 max-w-xl font-body text-xl text-muted">
          Ship the deck as a single <code className="font-mono text-accent">.html</code>. On its own it shows the poll's
          offline fallback; under <code className="font-mono text-accent">bunx liebstoeckel live</code> it lights up into a live
          session.
        </p>
      </div>
      <div className="shrink-0">
        <JoinCard size={300} />
      </div>
    </div>
  );
}
