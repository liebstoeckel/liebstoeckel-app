import { Plugin } from "@liebstoeckel/engine";

export const notes = (
  <div>
    <p>A <strong>second, independent poll</strong> — same plugin, different <code>instance</code>.</p>
    <ul>
      <li>Its votes/options are separate from the "build next" poll; they don't share state.</li>
      <li>In the presenter view you get <strong>two Poll tabs</strong>, each labelled by its question.</li>
    </ul>
  </div>
);

export default function PollPaceSlide() {
  return (
    <div className="flex h-full w-full items-center gap-14">
      <div className="w-[40%] shrink-0">
        <div className="mb-5 flex items-center gap-3 font-mono text-sm uppercase tracking-[0.35em] text-accent">
          <span className="h-px w-8 bg-accent" />
          Pulse check
        </div>
        <h2 className="font-heading text-[56px] font-semibold leading-[0.98] tracking-[-0.02em] text-text">
          A second poll.
        </h2>
        <p className="mt-6 max-w-md font-body text-xl text-muted">
          Same <code className="text-accent">poll</code> plugin, a different <code className="text-accent">instance</code> — its own
          question, options, and tally.
        </p>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <Plugin
          id="poll"
          instance="pace"
          props={{
            question: "How's the pace so far?",
            options: ["Too slow", "Just right", "Too fast"],
          }}
        />
      </div>
    </div>
  );
}
