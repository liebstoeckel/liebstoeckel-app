import { Plugin } from "@present-it/engine";

export const notes = (
  <div>
    <p>
      <strong>Live reactions.</strong> Emoji float up over the deck — ephemeral, rate-limited, never stored.
    </p>
    <ul>
      <li>Great for applause moments and quick sentiment.</li>
    </ul>
  </div>
);

export default function ReactionsSlide() {
  return (
    <div className="flex h-full w-full items-center gap-14">
      <div className="w-[44%] shrink-0">
        <div className="mb-5 flex items-center gap-3 font-mono text-sm uppercase tracking-[0.35em] text-accent">
          <span className="h-px w-8 bg-accent" />
          Feel the room
        </div>
        <h2 className="font-heading text-[56px] font-semibold leading-[0.98] tracking-[-0.02em] text-text">
          Reactions, <span className="italic text-primary">in the air</span>.
        </h2>
        <p className="mt-6 max-w-md font-body text-xl text-muted">
          Tap an emoji; it drifts up over the deck and fades. Transient by design — nothing bloats the shared state.
        </p>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <Plugin id="reactions" />
      </div>
    </div>
  );
}
