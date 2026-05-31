import { HelloChart } from "../charts/HelloChart";

export const notes = (
  <div>
    <p>
      <code>charts/HelloChart.tsx</code> + <code>charts/useBrandColors.ts</code> were scaffolded by the
      registry; <code>@visx/scale</code>/<code>group</code>/<code>shape</code> were added as deps.
    </p>
    <ul>
      <li>The chart reads the <strong>nocturne</strong> brand palette — re-brand and it follows.</li>
      <li>This is owned source: change the data array in <code>HelloChart.tsx</code> live.</li>
    </ul>
  </div>
);

export default function HelloChartSlide() {
  return (
    <div className="flex h-full w-full items-center gap-12">
      <div className="w-[36%] shrink-0">
        <div className="mb-5 flex items-center gap-3 font-mono text-sm uppercase tracking-[0.35em] text-accent">
          <span className="h-px w-8 bg-accent" />
          scaffolded
        </div>
        <h2 className="font-heading text-[52px] font-semibold leading-[1] tracking-[-0.02em] text-text">
          Yours to edit.
        </h2>
        <p className="mt-6 max-w-md font-body text-xl leading-relaxed text-muted">
          <code>liebstoeckel add hello-chart</code> wrote <code>charts/HelloChart.tsx</code> into this
          deck. No package import — change the data, palette, or springs and rebuild.
        </p>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-hidden rounded-3xl border border-border bg-surface/30 p-6 backdrop-blur-sm">
        <HelloChart />
      </div>
    </div>
  );
}
