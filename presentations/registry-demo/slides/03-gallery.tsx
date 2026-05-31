import { BarChart } from "../charts/BarChart";
import { LineChart } from "../charts/LineChart";
import { AreaChart } from "../charts/AreaChart";
import { DonutChart } from "../charts/DonutChart";
import { ScatterPlot } from "../charts/ScatterPlot";
import { StackedBarChart } from "../charts/StackedBarChart";

export const notes = (
  <div>
    <p>The full visx gallery, each scaffolded as owned source via <code>liebstoeckel add &lt;chart&gt;</code>.</p>
    <ul>
      <li>All read the active brand palette — re-brand and every chart follows.</li>
      <li>Bundler-verified: each item must build under <code>target:browser + minify</code>.</li>
    </ul>
  </div>
);

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface/30 p-4">
      <div className="self-start font-mono text-[11px] uppercase tracking-[0.3em] text-muted">{label}</div>
      <div className="flex flex-1 items-center justify-center">{children}</div>
    </div>
  );
}

export default function Gallery() {
  const w = 320;
  const h = 200;
  return (
    <div className="flex h-full w-full flex-col">
      <div className="mb-4 flex items-center gap-3 font-mono text-sm uppercase tracking-[0.35em] text-accent">
        <span className="h-px w-8 bg-accent" />
        the visx gallery
      </div>
      <div className="grid flex-1 grid-cols-3 grid-rows-2 gap-4">
        <Cell label="line"><LineChart width={w} height={h} /></Cell>
        <Cell label="area"><AreaChart width={w} height={h} /></Cell>
        <Cell label="bar"><BarChart width={w} height={h} /></Cell>
        <Cell label="stacked"><StackedBarChart width={w} height={h} /></Cell>
        <Cell label="donut"><DonutChart width={h} height={h} /></Cell>
        <Cell label="scatter"><ScatterPlot width={w} height={h} /></Cell>
      </div>
    </div>
  );
}
