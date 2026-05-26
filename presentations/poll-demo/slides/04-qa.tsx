import { Plugin } from "@present-it/engine";

export const notes = (
  <div>
    <p>
      <strong>Audience Q&amp;A.</strong> Anyone submits a question; everyone upvotes. The queue re-ranks live.
    </p>
    <ul>
      <li>Tap ✓ to mark a question answered, ✕ to dismiss it.</li>
      <li>Moderation is presenter-only.</li>
    </ul>
  </div>
);

export default function QaSlide() {
  return (
    <div className="flex h-full w-full items-center gap-14">
      <div className="w-[40%] shrink-0">
        <div className="mb-5 flex items-center gap-3 font-mono text-sm uppercase tracking-[0.35em] text-accent">
          <span className="h-px w-8 bg-accent" />
          Ask anything
        </div>
        <h2 className="font-heading text-[56px] font-semibold leading-[0.98] tracking-[-0.02em] text-text">
          Best questions <span className="italic text-primary">rise</span>.
        </h2>
        <p className="mt-6 max-w-md font-body text-xl text-muted">
          The room asks and upvotes; the queue re-orders itself in real time. You answer the most-wanted first.
        </p>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <Plugin id="qa" props={{ prompt: "What should we dig into?" }} />
      </div>
    </div>
  );
}
