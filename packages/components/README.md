# @liebstoeckel/components

> Shared React slide primitives for liebstoeckel decks: MDX element mapping, magic-move, and the brand atmosphere.

Part of [liebstoeckel](https://liebstoeckel.app), a code-first presentation framework. You write decks in MDX and TSX and build them into a single self-contained HTML file with no server or runtime dependencies. The same file works offline, and when you host it the deck runs a live session between the presenter and the audience. Built on Bun, React 19, Motion, and Tailwind v4.

> **Status: experimental, pre-1.0.** liebstoeckel is an evolving experiment, not yet production-ready. Before 1.0, breaking changes can land in any release without a major-version bump, so pin an exact version if you depend on it.

A small set of presentation primitives that the engine composes. `mdxComponents` maps Markdown and MDX elements to themed components, `Magic` does FLIP magic-move between slides, and `Atmosphere` is the brand-aware background. `@liebstoeckel/engine` re-exports all three, so decks usually get them for free. Install this package directly only when you want to use them on their own.

## Install

```sh
bun add @liebstoeckel/components
bun add react   # peer
```

> Bun-native, shipped as raw TypeScript. Animations use Motion.

## Usage

```tsx
import { Magic } from "@liebstoeckel/components";

// a stateless element that smoothly re-positions across slides (shared layoutId)
<Magic id="logo" className="text-accent">liebstoeckel</Magic>;
```

## Exports

- `mdxComponents` maps Markdown and MDX elements (`h1`, `h2`, `p`, `ul`, `li`, `strong`, `code`) to themed components. The engine feeds it to `<MDXProvider>`.
- `Magic` is magic-move for stateless content. It's a Motion `layout` element keyed by `layoutId` that FLIP-animates its box delta between slides.
- `Atmosphere` is the layered brand background, with drifting gradient blooms, film grain, and a vignette. Pass `still` for a motionless variant used in thumbnails and capture.

See the reference for each component's props.

## Architecture

A small runtime-only package. Three independent modules are re-exported from `src/index.ts`, with Motion as the only dependency and React 19 as a peer. There's no build step and no browser globals. The engine owns bundling and theming, and this package supplies the styled, animatable building blocks.

| Module | Role |
|---|---|
| `src/mdx.tsx` (`mdxComponents`) | The element-to-component map. Each element carries Tailwind classes (`text-text`, `text-primary`, `bg-surface`, …) that resolve against the active brand. Inline `code` becomes a themed pill. Shiki block code (non-string children) passes through, so the parent `.shiki` `<pre>` styles it. |
| `src/Magic.tsx` (`Magic`) | A `motion.div` with `layout` and `layoutId` for spring FLIP transitions of stateless content. For stateful elements (an iframe, video, or live app) the docs point authors at the engine's `<Slot>` and Persistent layer instead. |
| `src/Atmosphere.tsx` (`Atmosphere`) | A decoration-only backdrop driven by the `--brand-glow-*` and `--brand-accent` CSS variables. `still` disables the infinite drift, so capture and overview renders stay deterministic. |

The class names and CSS variables it emits are defined by the `@theme inline` bridge in `@liebstoeckel/theme`. `@liebstoeckel/engine` imports all three: `mdxComponents` into `<MDXProvider>`, `Atmosphere` into `SlideFrame`, and `Magic` re-exported from its index.

## Links

- [Components reference](https://docs.liebstoeckel.app/reference/components/)
- [Homepage](https://liebstoeckel.app)
- [Source and issues](https://github.com/liebstoeckel/liebstoeckel-app)

Licensed under [MPL-2.0](https://github.com/liebstoeckel/liebstoeckel-app/blob/main/LICENSE).
