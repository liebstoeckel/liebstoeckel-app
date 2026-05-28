# @liebstoeckel/plugin-ui

> Brand-aware React UI primitives for liebstoeckel plugins.

Themed building blocks — `Card`, `Button`, `Bar`, `Stack`, `Eyebrow` — plus `useTheme()` for reading
the active brand's tokens. Components style themselves against the deck's `--brand-*` CSS variables,
so plugin UIs match whatever brand is active without bundling Tailwind into your package.

Part of **[liebstoeckel](https://liebstoeckel.app)** — a code-first framework for animated,
single-file HTML presentations (Bun · React 19 · Motion · Tailwind v4 · MDX). Requires
[Bun](https://bun.sh); ships as raw TypeScript.

## Install

```sh
bun add @liebstoeckel/plugin-ui
```

Peer dep: `react`. (Pulls in `@liebstoeckel/plugin-sdk` for shared types.)

## Usage

```tsx
import { Card, Stack, Bar, Button, Eyebrow, useTheme } from "@liebstoeckel/plugin-ui";

function Results({ rows }: { rows: { label: string; pct: number }[] }) {
  const theme = useTheme(); // brand tokens; safe outside the browser (returns fallbacks)
  return (
    <Card>
      <Eyebrow>Results</Eyebrow>
      <Stack gap="0">
        {rows.map((r, i) => (
          <Bar key={r.label} label={r.label} pct={r.pct} color={theme.viz[i % theme.viz.length]} />
        ))}
      </Stack>
    </Card>
  );
}
```

## Exports

- `Card`, `Button`, `Bar`, `Stack`, `Eyebrow` — themed primitives
- `useTheme()` / `readTheme()` — read brand tokens (`primary`, `text`, `viz[]`, fonts, …)
- `ThemeTokens` — the token type

## Architecture

Two small modules, no build step or Tailwind dependency of its own. Components theme themselves by reading the deck's brand CSS variables at render time, so plugin UIs inherit whatever brand is active.

- **`primitives.tsx`** — the stateless components `Card`, `Button`, `Bar`, `Stack`, `Eyebrow`. Each styles inline against `var(--brand-*, fallback)` via a local `v(name, fallback)` helper (e.g. `--brand-surface`, `--brand-primary`, `--brand-font-body`), so they pick up the active `[data-brand]` without relying on Tailwind class generation inside `node_modules`. `Button` flips colors on `active`; `Bar` animates a clamped 0–100 fill width and can `highlight`. Authors override via `className`/`style`.
- **`useTheme.ts`** — `readTheme()` reads the same `--brand-*` variables off `document.body` via `getComputedStyle`, returning `ThemeTokens` (colors, fonts, `viz[]` palette); it's SSR/thumbnail-safe, falling back to a built-in dark palette when there's no `document`. `useTheme()` wraps it in a `useState` initializer so each component captures tokens once. `ThemeTokens` is re-exported from `@liebstoeckel/plugin-sdk`.

**Themeable component system & per-slide overrides:** primitives output CSS-variable-driven styles rather than fixed colors, which is the themeable layer. Per-slide overrides happen one level up: a plugin declares `surfaces` in its `PluginDef`, and the engine passes author-supplied replacements through `ClientProps.ui`; a plugin then renders `ui.X ?? DefaultX`. This package supplies the default surfaces; the override mechanism itself lives in the SDK/engine.

## Docs

- Building a plugin — https://liebstoeckel.app/plugins/building-a-plugin/

MPL-2.0
