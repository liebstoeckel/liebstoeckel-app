# @liebstoeckel/theme

> Design tokens and the Tailwind v4 theme that style liebstoeckel decks.

Part of [liebstoeckel](https://liebstoeckel.app), a code-first presentation framework. You write decks in MDX and TSX and build them into a single self-contained HTML file with no server or runtime dependencies. The same file works offline, and when you host it the deck runs a live session between the presenter and the audience. Built on Bun, React 19, Motion, and Tailwind v4.

> **Status: experimental, pre-1.0.** liebstoeckel is an evolving experiment, not yet production-ready. Before 1.0, breaking changes can land in any release without a major-version bump, so pin an exact version if you depend on it.

This package ships the deck's Tailwind v4 theme stylesheet and its design tokens. Drop the CSS into your build for the full look, or import the tokens for programmatic styling. There's no JavaScript runtime dependency, since your own Tailwind build processes the CSS.

## Install

```sh
bun add @liebstoeckel/theme
bun add tailwindcss   # peer (v4)
```

## Usage

```css
/* your deck's stylesheet */
@import "@liebstoeckel/theme/styles.css";
```

```ts
import * as tokens from "@liebstoeckel/theme/tokens";
```

## Exports

| Entry | What |
|---|---|
| `@liebstoeckel/theme` | JS surface: `defineTheme`, `themeToCss`, the `brands` array, and each brand (`liebstoeckel`, `acme`, `sunset`, `nocturne`) |
| `@liebstoeckel/theme/styles.css` | The Tailwind v4 theme stylesheet (drop-in) |
| `@liebstoeckel/theme/tokens` | The `Theme` token-shape type |

> **Requires Tailwind v4** in the consuming build, because `styles.css` does `@import "tailwindcss"`.

## Architecture

A brand is one typed token object (`Theme` in `src/tokens.ts`), and it's the single source of truth for a corporate look. The TypeScript tokens are generated into CSS, and a Tailwind `@theme inline` bridge wires utilities onto them, so swapping `[data-brand]` re-skins the whole deck at runtime.

| File | Role |
|---|---|
| `src/tokens.ts` | The `Theme` interface: `colors`, `fonts`, and optional `border`/`accent2`/`viz`/`glow`. |
| `src/brands/*.ts` | The shipped brands (`liebstoeckel` is the house default), collected in `brands/index.ts`. |
| `src/defineTheme.ts` | `defineTheme` (a typed identity helper) and `themeToCss`, which emits a brand as a `[data-brand="name"]{--brand-*:…}` block. |
| `src/gen.ts` | The build step (`bun run gen`). It runs `themeToCss` over every brand into `brands.generated.css`, keeping the TS tokens authoritative while shipping static CSS that Tailwind can process. |
| `src/index.css` | The entry stylesheet. It pulls in `@import "tailwindcss"`, `fonts.css`, the generated brands, and `code.css`, then the `@theme inline` bridge maps the `--color-*` and `--font-*` utilities onto `var(--brand-*)`. `inline` is essential, because a plain `@theme` would resolve at `:root`, where `--brand-*` is undefined. |
| `src/code.css` | Binds Shiki's `--shiki-token-*` (the css-variables theme) and the `.shiki`/`.pi-code` block chrome to brand variables, so build-time-highlighted code re-skins with `[data-brand]` and needs no per-brand syntax theme. |

The `--brand-*` variables defined here are consumed by `@liebstoeckel/components` (the `Atmosphere` glow and the `mdxComponents` classes) and `@liebstoeckel/engine` (the css-variables Shiki theme that its MDX plugin and `code` macro emit). There's no JS runtime dependency, since the consuming Tailwind v4 build processes `styles.css`.

## Links

- [Theming guide](https://docs.liebstoeckel.app/guides/theming/)
- [Homepage](https://liebstoeckel.app)
- [Source and issues](https://github.com/liebstoeckel/liebstoeckel-app)

Licensed under [MPL-2.0](https://github.com/liebstoeckel/liebstoeckel-app/blob/main/LICENSE).
