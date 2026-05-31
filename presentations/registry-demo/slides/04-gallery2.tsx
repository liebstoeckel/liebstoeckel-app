import { Heatmap } from "../charts/Heatmap";
import { TreemapChart } from "../charts/Treemap";
import { RadarChart } from "../charts/RadarChart";
import { RadialBarChart } from "../charts/RadialBarChart";

export const notes = (
  <div>
    <p>The distribution / hierarchy / radial family — all scaffolded via the registry.</p>
    <ul>
      <li><code>heatmap</code>, <code>treemap</code>, <code>radar-chart</code>, <code>radial-bar-chart</code>.</li>
      <li>These use <code>@visx/heatmap</code>, <code>@visx/hierarchy</code> — safe via the build plugin.</li>
    </ul>
  </div>
);

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface/30 p-4">
      <div className="self-start font-mono text-[11px] uppercase tracking-[0.3em] text-muted">{label}</div>
      <div className="flex items-center justify-center">{children}</div>
    </div>
  );
}

export default function Gallery2() {
  return (
    <div className="flex h-full w-full flex-col">
      <div className="mb-6 flex items-center gap-3 font-mono text-sm uppercase tracking-[0.35em] text-accent">
        <span className="h-px w-8 bg-accent" />
        distribution · hierarchy · radial
      </div>
      <div className="flex flex-1 items-center justify-center">
        <div className="grid grid-cols-4 gap-5">
          <Cell label="heatmap"><Heatmap width={270} height={250} /></Cell>
          <Cell label="treemap"><TreemapChart width={270} height={250} /></Cell>
          <Cell label="radar"><RadarChart width={260} height={260} /></Cell>
          <Cell label="radial-bar"><RadialBarChart width={260} height={260} /></Cell>
        </div>
      </div>
    </div>
  );
}
