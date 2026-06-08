# @liebstoeckel/components

> Shared React slide primitives for liebstoeckel decks — MDX element mapping, magic-move, and the brand atmosphere.

Part of **[liebstoeckel](https://liebstoeckel.app)** — a code-first presentation framework: author decks in **MDX + TSX**, get one self-contained HTML file that's animated, interactive, and live-shareable. Built on **Bun + React 19 + Motion + Tailwind v4**.

> ⚠️ Pre-release (`0.0.0`). APIs may change.

A small set of presentation primitives the engine composes: `mdxComponents` (themed Markdown/MDX element mapping), `Magic` (FLIP magic-move between slides), and `Atmosphere` (the brand-aware background). Re-exported by **@liebstoeckel/engine**, so decks usually get them transitively; install directly only to use them standalone.

## Install

```sh
bun add @liebstoeckel/components
bun add react   # peer
```

> Bun-native (raw TS). Animations are powered by Motion.

## Usage

```tsx
import { Magic } from "@liebstoeckel/components";

// a stateless element that smoothly re-positions across slides (shared layoutId)
<Magic id="logo" className="text-accent">liebstoeckel</Magic>;
```

## Exports

- **`mdxComponents`** — maps Markdown/MDX elements (`h1`, `h2`, `p`, `ul`, `li`, `strong`, `code`) to themed components; the engine feeds it to `<MDXProvider>`.
- **`Magic`** — magic-move for *stateless* content: a Motion `layout` element keyed by `layoutId` that FLIP-animates its box delta between slides.
- **`Atmosphere`** — the layered brand background (drifting gradient blooms, film grain, vignette); `still` renders a motionless variant for thumbnails/capture.

See the reference for each component's props.

## Architecture

A deliberately tiny, runtime-only package: three independent modules re-exported from `src/index.ts`, with **Motion** as the only dependency and **React 19** as a peer. No build step or browser globals — the engine owns bundling and theming; this package just supplies styled, animatable building blocks.

| Module | Role |
|---|---|
| `src/mdx.tsx` (`mdxComponents`) | Element→component map. Each element carries Tailwind classes (`text-text`, `text-primary`, `bg-surface`…) that resolve against the active brand. Inline `code` becomes a themed pill; Shiki block code (non-string children) passes through so the parent `.shiki` `<pre>` styles it. |
| `src/Magic.tsx` (`Magic`) | A `motion.div` with `layout` + `layoutId` for spring FLIP transitions of stateless content. For *stateful* elements (iframe/video/live app) the doc points authors at the engine's `<Slot>`/Persistent layer instead. |
| `src/Atmosphere.tsx` (`Atmosphere`) | Pure-decoration backdrop driven by `--brand-glow-*` / `--brand-accent` CSS vars; `still` disables the infinite drift so capture/overview renders are deterministic. |

The class names and CSS variables it emits are defined by **@liebstoeckel/theme**'s `@theme inline` bridge; **@liebstoeckel/engine** imports all three (`mdxComponents` into `<MDXProvider>`, `Atmosphere` into `SlideFrame`, `Magic` re-exported from its index).

## Docs

**[liebstoeckel.app/reference/components](https://docs.liebstoeckel.app/reference/components/)**

## License

[MPL-2.0](https://github.com/limond/liebstoeckel-app-public/blob/main/LICENSE)
