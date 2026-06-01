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

## 4. Editing a scaffolded chart

It's plain source. Change the data default, palette mapping, motion, or labels in
`charts/<Name>.tsx`. Re-running `add` will **not** overwrite your edits unless
`--force`.
