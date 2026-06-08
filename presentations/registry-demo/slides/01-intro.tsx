import { Step } from "@liebstoeckel/engine";

export const notes = (
  <div>
    <p>This deck demonstrates the component registry ((internal ADR) / 0041).</p>
    <ul>
      <li>The next slide's chart was scaffolded with <code>liebstoeckel add hello-chart</code>.</li>
      <li>Its source lives in <code>charts/</code> — the deck owns it.</li>
    </ul>
  </div>
);

export default function Intro() {
  return (
    <div className="w-full">
      <div className="mb-5 flex items-center gap-3 font-mono text-sm uppercase tracking-[0.35em] text-accent">
        <span className="h-px w-8 bg-accent" />
        registry demo
      </div>
      <h1 className="font-heading text-[88px] font-semibold leading-[0.95] tracking-[-0.03em] text-text">
        Scaffold, don't import.
      </h1>
      <div className="mt-10 space-y-4 font-body text-2xl text-muted">
        <Step>▹ liebstoeckel add hello-chart</Step>
        <Step>▹ source lands in charts/ — you own it</Step>
        <Step>▹ edit data, palette, and motion freely</Step>
      </div>
    </div>
  );
}
