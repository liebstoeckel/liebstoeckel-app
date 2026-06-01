---
name: liebstoeckel-deck
description: >-
  Create and edit liebstoeckel presentation decks from source material (reports,
  notes, data). Scaffolds a deck, adds visx chart components from the registry,
  wires in real data, validates, and builds to a single self-contained HTML or
  exports PNG/PDF. Use when the user asks to turn a document into slides, build or
  edit a presentation/deck, add a chart to a slide, or mentions liebstoeckel.
metadata:
  version: 0.0.0
license: MPL-2.0
---

# Authoring liebstoeckel decks

liebstoeckel is a code-first presentation framework: a deck is a project of
**MDX/TSX slide files** that builds to **one self-contained `.html`**. You author it
by writing slides and scaffolding chart components from a registry — the same code a
human writes. The `liebstoeckel` CLI does the scaffolding, building, and validating;
you write content and wire data. Drive everything through the CLI via bash.

**Always prefer the CLI's `--json` output** (it's the machine contract) and **run
`liebstoeckel build --check` in a loop until it passes** before declaring done — that
is your correctness signal.

## Create a deck from a source document

1. **See what charts exist** (do this first — never guess component names or data shapes):
   ```bash
   liebstoeckel registry list --json
   ```
   This returns every component with its `name`, `type`, and `dataShape`.

2. **Scaffold the deck:**
   ```bash
   liebstoeckel new <name> [--brand <brand>]      # creates ./presentations/<name>
   ```

3. **Outline the slides** from the source: a title, then one slide per key point.
   Decide which points are best shown as a chart and what data each needs.

4. **For every chart slide**, inspect the exact contract, scaffold it, then use it:
   ```bash
   liebstoeckel registry view bar-chart --json    # exports, props, dataShape, example
   liebstoeckel add bar-chart --dir ./presentations/<name>
   ```
   Then write a slide that imports the component (from the deck's `charts/`) and passes
   data **matching its `dataShape`** — see `references/charts.md`.

   The scaffolded `.tsx` is now **owned source in the deck** — it belongs to the deck,
   not to a package. Passing data via props is the common path, but when the slide needs
   something the props don't expose (a different palette, an extra series, an annotation,
   dropping the legend, a layout or motion tweak), **edit `charts/<Name>.tsx` directly to
   fit the use case.** That is the whole point of scaffolding owned source; don't work
   around a chart's limits when you can change the chart.

5. **Write prose slides** as MDX/TSX following `references/authoring.md`.

6. **Validate and fix in a loop:**
   ```bash
   liebstoeckel build --check --dir ./presentations/<name>   # JSON: { ok, diagnostics[] }
   ```
   If `ok` is false, fix each diagnostic (it carries `file`/`line`/`message`) and
   re-run until `ok` is true.

7. **Build or export:**
   ```bash
   liebstoeckel build ./presentations/<name>                 # → dist/index.html
   liebstoeckel export ./presentations/<name> --format pdf -o deck.pdf
   ```
   Report the output path.

## Edit an existing deck

Decks live under `presentations/<name>/` (or the project root). Slides are the files
in `slides/`, listed in order by the entry. To add/replace a slide, swap a chart, or
re-theme, see `references/editing.md`. Always finish with the `build --check` loop.

## Rules

- **Never invent component names, props, or data shapes** — read them from
  `registry list/view --json`. The registry is the source of truth.
- **Charts are owned source — adjust them to fit the use case.** After `add`, the
  `.tsx` lives in the deck's `charts/` and is the deck's code, not a package API.
  Prefer props for data, but freely edit the component itself (palette, series,
  annotations, labels, layout, motion) whenever the slide needs it — re-running `add`
  won't clobber your edits unless `--force`. Never import a chart from a package, and
  never treat its props as a hard limit.
- **Don't hand-write the final HTML** — author slides + components; let `build` render.
- Keep going until `build --check` passes; that is the definition of done.

## References

- `references/charts.md` — using scaffolded charts, data shapes, the `add` workflow.
- `references/authoring.md` — slide file conventions (MDX/TSX, notes, steps, layout, brands).
- `references/editing.md` — editing decks: add/replace slides, swap charts, re-theme, eject.
- `references/troubleshooting.md` — the `build --check` loop and common errors.

Full reference docs: https://liebstoeckel.app/llms.txt
