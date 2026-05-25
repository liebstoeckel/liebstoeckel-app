# present-it

Code-first presentations that are **real software** — authored in MDX + React, animated with Motion, themed from a single token file, and shipped as **one self-contained `.html`**. Built on Bun + React 19 + Tailwind v4.

> See [`DESIGN.md`](./DESIGN.md) for the architecture and the validated engineering findings.
>
> **Docs:** [State model](./docs/state-model.md) (with [diagram](./docs/state-handling.drawio.svg)) · [Engine](./packages/engine/docs/README.md) · [Plugins](./packages/plugin-sdk/docs/README.md) · [Live server](./packages/live-server/docs/README.md)

## Quickstart

```bash
bun install
bun run gen            # generate brand CSS from token files

bun run showcase:dev   # http://localhost:3001  — the visx data-viz deck
bun run demo:dev       # http://localhost:3000  — the minimal/persistent-iframe demo
```

In a running deck:

| Key | Action |
|-----|--------|
| `→` / `Space` | next · `←` previous · `Home`/`End` jump |
| **`P`** | open the **presenter view** (live slide + next preview + speaker notes + timer) |
| `T` | cycle brand (when a deck declares more than one) |
| **`?`** / right-click | toggle the keyboard-shortcuts overlay |

The presenter window and the audience window stay in sync over `BroadcastChannel` — drive from either.

## Author a presentation

A deck is an `index.html` + `main.tsx` that renders `<Present>` with an ordered list of slides:

```tsx
import { Present } from "@present-it/engine";
import "@present-it/theme/styles.css";
import * as title from "./slides/01-title";   // `import *` carries the `notes` export
import * as chart from "./slides/02-chart";

<Present title="My talk" brands={["nocturne"]} slides={[title, chart]} />;
```

A slide is a component (TSX) or Markdown (MDX), with optional speaker notes:

```tsx
// slides/02-chart.tsx
export const notes = <p>What to say while this is on screen.</p>;
export default function Chart() {
  return <GradientArea />;   // any React component — e.g. a visx chart
}
```

```mdx
{/* slides/01-title.mdx */}
export const notes = "Opening beat.";

# Markdown + React
Mix prose and **components** freely.
```

## Build → one file

```bash
bun run showcase:build     # → presentations/visx-showcase/dist/index.html
```

One portable HTML with JS, CSS, **fonts**, and assets inlined — no server, no CDN, no runtime deps.

## Theming (one place, many brands)

A brand is one typed token file. Edit it, run `bun run gen`, and every deck on that brand re-skins:

```ts
// packages/theme/src/brands/nocturne.ts
export const nocturne = defineTheme({
  name: "nocturne",
  colors: { bg: "#08090c", text: "#f3f1ea", primary: "#caff4d", accent: "#62e8ff", /* … */ },
  fonts:  { heading: '"Fraunces Variable", serif', body: '"Hanken Grotesk Variable", sans-serif', mono: '"JetBrains Mono Variable", monospace' },
  viz:    ["#caff4d", "#62e8ff", "#ff7a59", "#b692ff", "#ffd166"],
});
```

Tokens become Tailwind utilities (`bg-bg`, `text-primary`, `font-heading`) via a `@theme inline` bridge, so switching `data-brand` swaps the entire look.

## Live server & plugins

Turn a deck into a live, interactive session — `bunx`-style, no install:

```bash
bun run poll:live          # build the poll demo + serve it live
# → prints presenter + read-only links and a QR to scan
```

- **Audience** opens the read-only link (or scans the QR via `Q` in-deck) and **follows along**; the presenter drives.
- **Plugins** are Bun packages (`keywords: ["present-it-plugin"]` + a `presentIt` field) with a required **client** and optional **server** part. They share **typed state over Yjs**, so everyone — including read-only viewers — can interact (e.g. vote in a poll). The same `.html` runs standalone (plugins show a `fallback`) or live.
- Place one in a slide: `<Plugin id="poll" props={{ question, options }} />`. Author a plugin with `definePlugin({ id, state, server?, client })` from `@present-it/plugin-sdk`; build UI from `@present-it/plugin-ui` (themeable + per-slide overridable).

Live-delivery keys: `F` fullscreen · `B` blur-screen · `O` overview · `0-9`↵ jump · `Q` QR · steps reveal with `→`.

## Packages

- **`@present-it/engine`** — `Present`, `Deck`, `PresenterView`, fixed-canvas `ScaledStage`, keyboard/sync, `Slot`/`PersistentLayer` (stateful elements that travel between slides without reloading). **Docs: [`packages/engine/docs`](./packages/engine/docs/README.md).**
- **`@present-it/theme`** — token model, brands, `@theme inline` bridge, self-hosted fonts.
- **`@present-it/components`** — MDX element mapping, `Magic` (Magic Move), `Atmosphere`.
