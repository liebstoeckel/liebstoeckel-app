# @liebstoeckel/theme

> Design tokens + the Tailwind v4 theme that styles liebstoeckel decks.

Part of **[liebstoeckel](https://liebstoeckel.app)** — a code-first presentation framework: author decks in **MDX + TSX**, get one self-contained HTML file that's animated, interactive, and live-shareable. Built on **Bun + React 19 + Motion + Tailwind v4**.

> ⚠️ Pre-release (`0.0.0`). APIs may change.

Ships the deck's Tailwind v4 theme stylesheet and its design tokens. Drop the CSS into your build for the full look, or import the tokens for programmatic styling. No JavaScript runtime dependency — your Tailwind build processes the CSS.

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

> **Requires Tailwind v4** in the consuming build — `styles.css` does `@import "tailwindcss"`.

## Architecture

A brand is one **typed token object** (`Theme` in `src/tokens.ts`) — the single source of truth for a corporate look. TS tokens are generated into CSS, and a Tailwind `@theme inline` bridge wires utilities onto them so swapping `[data-brand]` re-skins the whole deck at runtime.

| File | Role |
|---|---|
| `src/tokens.ts` | The `Theme` interface: `colors`, `fonts`, optional `border`/`accent2`/`viz`/`glow`. |
| `src/brands/*.ts` | The shipped brands (`liebstoeckel` is the house default), collected in `brands/index.ts`. |
| `src/defineTheme.ts` | `defineTheme` (typed identity helper) + `themeToCss`, which emits a brand as a `[data-brand="name"]{--brand-*:…}` block. |
| `src/gen.ts` | Build step (`bun run gen`): runs `themeToCss` over every brand into `brands.generated.css`, keeping TS tokens authoritative while shipping static CSS Tailwind can process. |
| `src/index.css` | Entry stylesheet: `@import "tailwindcss"` + `fonts.css` + the generated brands + `code.css`, then the **`@theme inline`** bridge mapping `--color-*`/`--font-*` utilities onto `var(--brand-*)`. `inline` is essential — plain `@theme` would resolve at `:root` where `--brand-*` is undefined. |
| `src/code.css` | Binds Shiki's `--shiki-token-*` (css-variables theme) and the `.shiki`/`.pi-code` block chrome to brand vars, so build-time-highlighted code re-skins with `[data-brand]` — no per-brand syntax theme. |

The `--brand-*` vars consumed here are produced for **@liebstoeckel/components** (`Atmosphere` glow, `mdxComponents` classes) and **@liebstoeckel/engine** (the css-variables Shiki theme its MDX plugin and `code` macro emit). No JS runtime dependency: the consuming Tailwind v4 build processes `styles.css`.

## Docs

**[liebstoeckel.app/guides/theming](https://docs.liebstoeckel.app/guides/theming/)**

## License

[MPL-2.0](https://github.com/liebstoeckel/liebstoeckel-app/blob/main/LICENSE)
