# liebstoeckel

Code-first presentations that are **real software** — authored in MDX + React, animated with Motion, themed from a single token file, and shipped as **one self-contained `.html`**. Built on Bun + React 19 + Tailwind v4.

> See [`DESIGN.md`](./DESIGN.md) for the architecture and the validated engineering findings.
>
> **Docs:** [liebstoeckel.app](https://liebstoeckel.app) — guides, concepts (incl. the [state model](https://liebstoeckel.app/concepts/state-model/)), plugin authoring & API reference. Source lives in [`packages/docs`](./packages/docs).

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
import { Present } from "@liebstoeckel/engine";
import "@liebstoeckel/theme/styles.css";
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
# → prints presenter + read-only links to share
```

- **Audience** opens the read-only link (or scans the QR via `Q` in-deck) and **follows along**; the presenter drives.
- **Plugins** are Bun packages (`keywords: ["liebstoeckel-plugin"]` + a `liebstoeckel` field) with a required **client** and optional **server** part. They share **typed state over Yjs**, so everyone — including read-only viewers — can interact (e.g. vote in a poll). The same `.html` runs standalone (plugins show a `fallback`) or live.
- Place one in a slide: `<Plugin id="poll" props={{ question, options }} />`. Author a plugin with `definePlugin({ id, state, server?, client })` from `@liebstoeckel/plugin-sdk`; build UI from `@liebstoeckel/plugin-ui` (themeable + per-slide overridable).

Live-delivery keys: `F` fullscreen · `B` blur-screen · `O` overview · `0-9`↵ jump · `Q` QR · steps reveal with `→`.

## Architecture

liebstoeckel is a Bun monorepo. The flow is **author → compile → render → (deliver)**:

1. **Author** a deck as MDX/TSX slides on a brand from **`theme`**, composing primitives from **`components`** and interactive **plugins**.
2. **`engine`** compiles it: `Bun.build` inlines JS/CSS/fonts, an MDX plugin Shiki-highlights code at build time, and a Bun macro pre-tokenizes animated code — producing **one self-contained HTML** with no runtime deps.
3. The same HTML **renders** standalone: a fixed-canvas `ScaledStage`, Motion transitions, keyboard/touch nav, and a `BroadcastChannel`-synced presenter view.
4. To **deliver live**, `live-server` (LAN) or `present-relay` (WAN) hosts the deck and runs a shared **Yjs** document; the engine's live client syncs presenter↔audience and drives plugins. Plugins (`plugin-sdk` + `plugin-ui`) define typed CRDT state so every viewer can interact; they fall back to static UI offline.

`cli` is the umbrella command over all of it; `thumbnails` captures slide previews; `docs`/`docs-dist` build & serve the docs site; `ci-poller` and `e2e` are internal CI/test infra.

> Deep dive: [`DESIGN.md`](./DESIGN.md) and the docs [architecture](https://liebstoeckel.app/concepts/architecture/) / [state model](https://liebstoeckel.app/concepts/state-model/) pages. Each package README has an **Architecture** section covering its internals.

## Packages

Every package has its own README (linked below) detailing usage and internal architecture.

**Core — author, compile, render**

| Package | Role |
|---|---|
| [`@liebstoeckel/engine`](./packages/engine/README.md) | Build pipeline, React 19 + Motion runtime, and live/plugin layer that compiles MDX/TSX decks into one self-contained HTML. |
| [`@liebstoeckel/components`](./packages/components/README.md) | Runtime primitives the engine composes: themed `mdxComponents`, magic-move `Magic`, brand `Atmosphere`. |
| [`@liebstoeckel/theme`](./packages/theme/README.md) | Typed brand tokens compiled to `[data-brand]` CSS + a Tailwind v4 `@theme inline` bridge; swap one attribute to re-skin. |

**Plugins — interactive, Yjs-synced**

| Package | Role |
|---|---|
| [`@liebstoeckel/plugin-sdk`](./packages/plugin-sdk/README.md) | `definePlugin`, the runtime-typed state model over a `Y.Map`, and the client/server contract. |
| [`@liebstoeckel/plugin-ui`](./packages/plugin-ui/README.md) | Themeable component primitives + `useTheme`, with per-slide override surfaces. |
| [`@liebstoeckel/plugin-poll`](./packages/plugin-poll/README.md) | Live audience polling (pure CRDT, no server). |
| [`@liebstoeckel/plugin-qa`](./packages/plugin-qa/README.md) | Audience Q&A with upvotes and presenter answer/dismiss controls. |
| [`@liebstoeckel/plugin-reactions`](./packages/plugin-reactions/README.md) | Ephemeral, rate-limited floating-emoji reactions. |

**Live delivery**

| Package | Role |
|---|---|
| [`@liebstoeckel/live-server`](./packages/live-server/README.md) | Local `Bun.serve` host for one deck — Yjs hub, presenter/viewer tokens, QR (LAN). |
| [`@liebstoeckel/present-relay`](./packages/present-relay/README.md) | Multi-tenant public relay reusing the hub/session primitives for WAN presenting. |

**Tooling, docs & infra**

| Package | Role |
|---|---|
| [`@liebstoeckel/cli`](./packages/cli/README.md) | The `liebstoeckel` / `lst` umbrella command (`new`, `dev`, `build`, `live`, `relay`, `thumbs`, `present`). |
| [`@liebstoeckel/thumbnails`](./packages/thumbnails/README.md) | Headless-Chromium slide-thumbnail capture embedded back into a built deck. |
| [`@liebstoeckel/docs`](./packages/docs/README.md) | Astro Starlight source for [liebstoeckel.app](https://liebstoeckel.app) *(private)*. |
| [`@liebstoeckel/docs-dist`](./packages/docs-dist/README.md) | nginx container image that serves the built docs *(private)*. |
| [`@liebstoeckel/ci-poller`](./packages/ci-poller/README.md) | Pull-based Tekton CI trigger; reconciles repo refs into PipelineRuns *(private)*. |
| [`@liebstoeckel/e2e`](./packages/e2e/README.md) | Headless-browser smoke-test tier over a real built fixture deck *(private)*. |

## License

[MPL-2.0](./LICENSE) — see each package for details.
