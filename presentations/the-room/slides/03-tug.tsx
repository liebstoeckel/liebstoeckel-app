import { Plugin } from "@liebstoeckel/engine";

export const notes = (
  <div>
    <p>Not a built-in: this tug of war is a plugin in this deck, in <code>plugins/tug</code>.</p>
    <p>Every tap is a write to one shared state, and the rope moves on every screen. Press "New round" on the card to reset.</p>
  </div>
);

export default function TugSlide() {
  return (
    <div className="flex h-full w-full items-center gap-14">
      <div className="w-[40%] shrink-0">
        <div className="mb-5 flex items-center gap-3 font-mono text-sm uppercase tracking-[0.35em] text-accent">
          <span className="h-px w-8 bg-accent" />
          A plugin of its own
        </div>
        <h2 className="font-heading text-[56px] font-semibold leading-[0.98] tracking-[-0.02em] text-text">
          Tabs against spaces
        </h2>
        <p className="mt-6 max-w-md font-body text-xl text-muted">
          Pick a side and tap as fast as you can. The rope is one shared state, and every phone pulls on it.
        </p>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <Plugin id="tug" props={{ left: "Tabs", right: "Spaces" }} />
      </div>
    </div>
  );
}
