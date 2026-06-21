#!/usr/bin/env bun
/**
 * Generate `items/<id>.json` manifests + `registry.json` from the source files in
 * `files/`. Dependencies are DERIVED from each file's imports, npm leaves from
 * `@visx/*` imports, registryDependencies from relative (`./X`) imports, so a
 * manifest can never drift from the code it ships. Re-run after adding/editing an
 * item:  `bun run packages/registry/src/gen.ts`
 */
import { join, basename, extname } from "node:path";
import { REGISTRY_ROOT } from "./index.ts";
import { validateItem, type RegistryItem, type RegistryItemMeta, type RegistryItemType } from "./schema.ts";

interface ItemMeta {
  id: string;
  type: RegistryItemType;
  /** primary source file under files/charts/ */
  file: string;
  description: string;
  /** agent-facing usage metadata ((internal ADR)), hand-authored, kept in sync with the source */
  meta: RegistryItemMeta;
}

const VERSION = "0.1.0";

// Every chart shares `width?: number; height?: number` (defaults provided); the props
// string below lists the data prop + any extras. `dataShape` is the type of `data`.
const SIZE = "width?: number; height?: number";

// The catalog. `file` is the source under files/charts/; deps + registryDependencies
// are derived from that file's imports below. `meta` is hand-authored agent usage info.
const META: ItemMeta[] = [
  { id: "use-brand-colors", type: "registry:hook", file: "useBrandColors.ts",
    description: "Reads the active brand's chart palette from CSS variables, synchronously (no flash).",
    meta: { exports: "useBrandColors", props: "()",
      example: "const c = useBrandColors(); // c.viz[], c.text, c.accent, c.surface, c.muted, c.border" } },
  { id: "brand-axis", type: "registry:element", file: "BrandAxis.tsx",
    description: "Brand-styled wrappers around @visx/axis (BrandAxisBottom / BrandAxisLeft).",
    meta: { exports: "BrandAxisBottom, BrandAxisLeft", props: "(@visx/axis props: scale, top?, left?, …)",
      example: "<BrandAxisLeft scale={yScale} /> <BrandAxisBottom top={h} scale={xScale} />" } },
  { id: "hello-chart", type: "registry:chart", file: "HelloChart.tsx",
    description: "A tiny animated visx bar chart that reads the active brand palette, the registry's hello world.",
    meta: { exports: "HelloChart", props: `{ data?: HelloChartDatum[]; ${SIZE} }`,
      dataShape: "{ label: string; value: number }[]",
      example: "<HelloChart data={[{ label: 'A', value: 10 }, { label: 'B', value: 24 }]} />" } },
  { id: "bar-chart", type: "registry:chart", file: "BarChart.tsx",
    description: "Vertical bar chart with axes, gridlines, value labels and a staggered spring rise-in.",
    meta: { exports: "BarChart", props: `{ data?: BarChartDatum[]; ${SIZE} }`,
      dataShape: "{ label: string; value: number }[]",
      example: "<BarChart data={[{ label: 'Q1', value: 128 }, { label: 'Q2', value: 174 }]} />" } },
  { id: "horizontal-bar-chart", type: "registry:chart", file: "HorizontalBarChart.tsx",
    description: "Horizontal ranking bars with category + value labels and a grow-in animation.",
    meta: { exports: "HorizontalBarChart", props: `{ data?: HorizontalBarChartDatum[]; ${SIZE} }`,
      dataShape: "{ label: string; value: number }[]",
      example: "<HorizontalBarChart data={[{ label: 'Rust', value: 82 }, { label: 'Go', value: 67 }]} />" } },
  { id: "stacked-bar-chart", type: "registry:chart", file: "StackedBarChart.tsx",
    description: "Stacked bars across categories (BarStack) with a legend, axes and rise-in.",
    meta: { exports: "StackedBarChart", props: `{ data?: StackedDatum[]; keys?: string[]; ${SIZE} }`,
      dataShape: "{ label: string; [series: string]: number | string }[]  // + keys: string[] of the series",
      example: "<StackedBarChart data={[{ label: 'Q1', Direct: 10, Social: 5 }]} keys={['Direct', 'Social']} />" } },
  { id: "grouped-bar-chart", type: "registry:chart", file: "GroupedBarChart.tsx",
    description: "Side-by-side grouped bars (BarGroup) with a legend, axes and rise-in.",
    meta: { exports: "GroupedBarChart", props: `{ data?: GroupedDatum[]; keys?: string[]; ${SIZE} }`,
      dataShape: "{ label: string; [series: string]: number | string }[]  // + keys: string[] of the series",
      example: "<GroupedBarChart data={[{ label: 'Q1', '2024': 10, '2025': 14 }]} keys={['2024', '2025']} />" } },
  { id: "line-chart", type: "registry:chart", file: "LineChart.tsx",
    description: "Multi-series smooth line chart with axes, gridlines and a left-to-right draw-in.",
    meta: { exports: "LineChart", props: `{ data?: LineSeries[]; ${SIZE} }`,
      dataShape: "{ label: string; points: { x: number; y: number }[] }[]",
      example: "<LineChart data={[{ label: 'Revenue', points: [{ x: 0, y: 10 }, { x: 1, y: 22 }] }]} />" } },
  { id: "area-chart", type: "registry:chart", file: "AreaChart.tsx",
    description: "Gradient area + line with axes and a clip-path reveal.",
    meta: { exports: "AreaChart", props: `{ data?: AreaPoint[]; ${SIZE} }`,
      dataShape: "{ x: number; y: number }[]",
      example: "<AreaChart data={[{ x: 0, y: 120 }, { x: 1, y: 180 }, { x: 2, y: 150 }]} />" } },
  { id: "sparkline", type: "registry:chart", file: "Sparkline.tsx",
    description: "A tiny inline area+line sparkline (no axes), takes data: number[] and a unique id.",
    meta: { exports: "Sparkline", props: `{ data?: number[]; id: string; ${SIZE} }`,
      dataShape: "number[]  // note: a unique `id` prop is required",
      example: "<Sparkline id=\"rev\" data={[12, 14, 11, 18, 22, 27]} />" } },
  { id: "donut-chart", type: "registry:chart", file: "DonutChart.tsx",
    description: "Animated donut (Pie) with a legend and a centered total.",
    meta: { exports: "DonutChart", props: `{ data?: DonutDatum[]; ${SIZE} }`,
      dataShape: "{ label: string; value: number }[]",
      example: "<DonutChart data={[{ label: 'Direct', value: 38 }, { label: 'Organic', value: 27 }]} />" } },
  { id: "scatter-plot", type: "registry:chart", file: "ScatterPlot.tsx",
    description: "Scatter plot on linear scales with brand-styled axes and gridlines.",
    meta: { exports: "ScatterPlot", props: `{ data?: ScatterDatum[]; ${SIZE} }`,
      dataShape: "{ x: number; y: number; z?: number }[]  // z scales the point radius",
      example: "<ScatterPlot data={[{ x: 10, y: 20, z: 5 }, { x: 30, y: 45 }]} />" } },
  { id: "heatmap", type: "registry:chart", file: "Heatmap.tsx",
    description: "Rectangular heatmap (HeatmapRect) with value-scaled opacity from the brand palette.",
    meta: { exports: "Heatmap", props: `{ data?: HeatmapDatum[]; ${SIZE} }`,
      dataShape: "{ day: string; values: number[] }[]  // one row per column, values down the column",
      example: "<Heatmap data={[{ day: 'Mon', values: [3, 7, 2, 9] }, { day: 'Tue', values: [5, 1, 8, 4] }]} />" } },
  { id: "treemap", type: "registry:chart", file: "Treemap.tsx",
    description: "Squarified treemap of hierarchical data, colored from the brand palette.",
    meta: { exports: "TreemapChart", props: `{ data?: TreemapNode; ${SIZE} }`,
      dataShape: "{ name: string; value?: number; children?: TreemapNode[] }  // leaves carry value",
      example: "<TreemapChart data={{ name: 'Spend', children: [{ name: 'GPU', value: 320 }, { name: 'Storage', value: 210 }] }} />" } },
  { id: "radar-chart", type: "registry:chart", file: "RadarChart.tsx",
    description: "Radar/spider chart with concentric grid and 1-2 filled series.",
    meta: { exports: "RadarChart", props: `{ data?: RadarSeries[]; ${SIZE} }`,
      dataShape: "{ name: string; data: { axis: string; value: number }[] }[]  // 1-2 series",
      example: "<RadarChart data={[{ name: 'v2', data: [{ axis: 'Speed', value: 82 }, { axis: 'Cost', value: 58 }] }]} />" } },
  { id: "radial-bar-chart", type: "registry:chart", file: "RadialBarChart.tsx",
    description: "Bars arranged around a circle (Arc + scaleRadial), sweeping in.",
    meta: { exports: "RadialBarChart", props: `{ data?: RadialBarDatum[]; ${SIZE} }`,
      dataShape: "{ label: string; value: number }[]",
      example: "<RadialBarChart data={[{ label: 'Mon', value: 68 }, { label: 'Tue', value: 92 }]} />" } },
  { id: "legend", type: "registry:element", file: "Legend.tsx",
    description: "Brand-styled ordinal legend (@visx/legend) for placing beside a chart.",
    meta: { exports: "Legend", props: "{ entries: LegendEntry[]; title?: string }",
      dataShape: "{ label: string; color: string }[]  // passed as the `entries` prop",
      example: "<Legend entries={[{ label: 'Direct', color: '#6ee7b7' }]} />" } },
];

// basename-without-ext → item id, for resolving relative (`./X`) imports to registryDependencies
const idByBase = new Map(META.map((m) => [basename(m.file, extname(m.file)), m.id]));

const IMPORT_RE = /from\s+"((?:@visx\/[a-z-]+)|(?:\.\/[A-Za-z0-9_-]+))"/g;

async function deriveItem(meta: ItemMeta): Promise<RegistryItem> {
  const src = await Bun.file(join(REGISTRY_ROOT, "files", "charts", meta.file)).text();
  const deps = new Set<string>();
  const regDeps = new Set<string>();
  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[1]!;
    if (spec.startsWith("@visx/")) {
      deps.add(spec);
    } else {
      const id = idByBase.get(spec.replace("./", ""));
      if (id && id !== meta.id) regDeps.add(id);
    }
  }
  const item: RegistryItem = {
    name: meta.id,
    type: meta.type,
    version: VERSION,
    description: meta.description,
    dependencies: [...deps].sort(),
    registryDependencies: [...regDeps].sort(),
    files: [
      {
        path: `files/charts/${meta.file}`,
        type: meta.type,
        target: `charts/${meta.file}`,
      },
    ],
    meta: meta.meta,
  };
  validateItem(item);
  return item;
}

const items = await Promise.all(META.map(deriveItem));

for (const item of items) {
  const out = { $schema: "https://docs.liebstoeckel.app/schema/registry-item.json", ...item };
  await Bun.write(join(REGISTRY_ROOT, "items", `${item.name}.json`), JSON.stringify(out, null, 2) + "\n");
}

const index = {
  $schema: "https://docs.liebstoeckel.app/schema/registry.json",
  name: "@liebstoeckel",
  homepage: "https://liebstoeckel.app",
  items: items.map((i) => ({ name: i.name, type: i.type, version: i.version, description: i.description })),
};
await Bun.write(join(REGISTRY_ROOT, "registry.json"), JSON.stringify(index, null, 2) + "\n");

console.log(`✓ generated ${items.length} item manifests + registry.json`);
for (const i of items) {
  console.log(`   ${i.name.padEnd(22)} deps: ${(i.dependencies ?? []).join(", ") || "none"}` +
    (i.registryDependencies?.length ? `  | reg: ${i.registryDependencies.join(", ")}` : ""));
}
