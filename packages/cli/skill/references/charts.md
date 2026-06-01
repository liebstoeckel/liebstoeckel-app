# Charts: discover, scaffold, wire data

Charts come from the registry as **owned source** — `liebstoeckel add` copies the
`.tsx` into the deck's `charts/` and installs the visx packages it needs. After that
the file is yours to edit.

## 1. Discover (always, before using a chart)

```bash
liebstoeckel registry list --json          # whole catalog with dataShape
liebstoeckel registry view <name> --json   # one item: exports, props, dataShape, example
```

`registry view` returns the authoritative contract:

```jsonc
{
  "name": "bar-chart",
  "meta": {
    "exports": "BarChart",
    "props": "{ data?: BarChartDatum[]; width?: number; height?: number }",
    "dataShape": "{ label: string; value: number }[]",
    "example": "<BarChart data={[{ label: 'Q1', value: 128 }]} />"
  }
}
```

Use `exports` for the import name (note some differ from the id — e.g. the `treemap`
item exports **`TreemapChart`**), and shape your data to `dataShape` exactly.

## 2. Scaffold

```bash
liebstoeckel add <name> --dir ./presentations/<deck>
# JSON when piped: { action, wrote[], skipped[], dependencies[], installed }
```

`add` is idempotent — existing files are reported as `skipped` (pass `--force` to
overwrite a chart you've since edited). It also pulls in any `registryDependencies`
(e.g. every chart pulls `use-brand-colors`). Preview without writing: `add <name>
--dry --json`.

## 3. Use it in a slide

Import from the deck's `charts/` and pass data matching `dataShape`:

```tsx
import { BarChart } from "../charts/BarChart";
// …
<BarChart data={[{ label: "Q1", value: 128 }, { label: "Q2", value: 174 }]} />
```

Notes:

- Charts size to a `width`/`height` prop (defaults provided); wrap in a sized
  container or pass explicit numbers for grids of charts.
- `sparkline` requires a unique `id` prop.
- `stacked-bar-chart` / `grouped-bar-chart` take a `keys: string[]` listing the series.
- All charts read the active brand palette — no color props needed.

## 4. Adjust the chart to fit the slide (encouraged)

A scaffolded chart is **the deck's own source**, not a fixed package API. Wiring data
through props is the common case, but when the slide needs more, **open
`charts/<Name>.tsx` and change it** — that's why it was copied in, not imported. Common
adjustments:

- **Palette** — recolor a series, or map a category to a brand color (`useBrandColors`
  gives `c.viz[]`, `c.accent`, …).
- **Shape** — add/remove a series, change the axis range, add a reference line,
  threshold band, or label/annotation.
- **Chrome** — drop the legend, change the value-label format, restyle the axis.
- **Motion** — retime or remove the entrance animation.

Re-running `liebstoeckel add <name>` will **not** overwrite your edits unless you pass
`--force` (which restores the pristine registry version). So edit freely — your copy is
yours. Prefer adjusting the component over contorting the data or fighting the props.
