# Components: discover, scaffold, wire data

Components come from the registry as **owned source** — `liebstoeckel add` copies the
file into the deck and installs whatever npm packages it needs. After that the file is
yours to edit.

## Component types

The registry is not just charts. Each item declares a `type` (one of the categories
below), and `add` writes it to wherever that item's manifest points — the **target path
is the manifest author's choice, not a fixed `charts/` rule**.

| category   | `type`              | what it is                                        |
|------------|---------------------|---------------------------------------------------|
| `chart`    | `registry:chart`    | a data-viz component (visx-based)                 |
| `element`  | `registry:element`  | a smaller building block (axis, legend, …)        |
| `hook`     | `registry:hook`     | a reusable hook (e.g. brand palette access)       |
| `component`| `registry:component`| a general UI component                            |
| `layout`   | `registry:layout`   | a slide-layout component                          |
| `motion`   | `registry:motion`   | an animation helper                               |
| `brand`    | `registry:brand`    | brand/theme tokens                                |

Today the catalog is **chart-heavy** — most items are charts, alongside a couple of
chart `element`s (`brand-axis`, `legend`) and the `use-brand-colors` `hook` — and those
all land under the deck's `charts/`. But more types can be added, and they land wherever
their manifest's `target` says. **Don't assume the category from the folder; read the
`type` from the registry.**

`liebstoeckel add` also resolves `registryDependencies`, so adding a chart pulls in the
`element`s and `hook`s it depends on automatically — you rarely add those by hand.

## 1. Discover (always, before using a component)

```bash
liebstoeckel registry list --json          # whole catalog: name, type, dataShape
liebstoeckel registry view <name> --json   # one item: exports, props, dataShape, example
```

`registry view` returns the authoritative contract:

```jsonc
{
  "name": "bar-chart",
  "type": "registry:chart",
  "meta": {
    "exports": "BarChart",
    "props": "{ data?: BarChartDatum[]; width?: number; height?: number }",
    "dataShape": "{ label: string; value: number }[]",
    "example": "<BarChart data={[{ label: 'Q1', value: 128 }]} />"
  }
}
```

Use `exports` for the import name (note some differ from the id — e.g. the `treemap`
item exports **`TreemapChart`**), and shape your data to `dataShape` exactly. A `hook`
or `element` has the same `meta` contract — read `exports`/`props`/`example` the same
way; only `chart`s carry a `dataShape`.

## 2. Scaffold

```bash
liebstoeckel add <name> --dir ./presentations/<deck>
liebstoeckel add <category> <name> --dir …   # optional sugar: `add chart bar-chart`
# JSON when piped: { action, wrote[], skipped[], dependencies[], installed }
```

`add` is idempotent — existing files are reported as `skipped` (pass `--force` to
overwrite something you've since edited). It also pulls in any `registryDependencies`
(e.g. every chart pulls `use-brand-colors`). Preview without writing: `add <name>
--dry --json` — the `wrote[]`/plan shows the exact target paths, so you never have to
guess where a component landed.

## 3. Use it in a slide

Import from wherever `add` wrote it (the `wrote[]` paths) and pass data matching
`dataShape`:

```tsx
import { BarChart } from "../charts/BarChart";
// …
<BarChart data={[{ label: "Q1", value: 128 }, { label: "Q2", value: 174 }]} />
```

Notes (chart specifics):

- Charts size to a `width`/`height` prop (defaults provided); wrap in a sized
  container or pass explicit numbers for grids of charts.
- `sparkline` requires a unique `id` prop.
- `stacked-bar-chart` / `grouped-bar-chart` take a `keys: string[]` listing the series.
- All charts read the active brand palette — no color props needed.

## 4. Adjust the component to fit the slide (encouraged)

A scaffolded file is **the deck's own source**, not a fixed package API. Wiring data
through props is the common case, but when the slide needs more, **open the file and
change it** — that's why it was copied in, not imported. Common adjustments (charts):

- **Palette** — recolor a series, or map a category to a brand color (`useBrandColors`
  gives `c.viz[]`, `c.accent`, …).
- **Shape** — add/remove a series, change the axis range, add a reference line,
  threshold band, or label/annotation.
- **Chrome** — drop the legend, change the value-label format, restyle the axis.
- **Motion** — retime or remove the entrance animation.

Re-running `liebstoeckel add <name>` will **not** overwrite your edits unless you pass
`--force` (which restores the pristine registry version). So edit freely — your copy is
yours. Prefer adjusting the component over contorting the data or fighting the props.
