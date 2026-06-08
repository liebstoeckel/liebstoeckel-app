# @liebstoeckel/docs

> The source for **[docs.liebstoeckel.app](https://docs.liebstoeckel.app)** — the documentation site.

Part of **[liebstoeckel](https://liebstoeckel.app)** — a code-first presentation framework: author decks in **MDX + TSX**, get one self-contained HTML file that's animated, interactive, and live-shareable. Built on **Bun + React 19 + Motion + Tailwind v4**.

> ⚠️ Pre-release (`0.0.0`). APIs may change.

The [Astro **Starlight**](https://starlight.astro.build) site behind liebstoeckel.app: guides, concepts, plugin docs, and the API/CLI reference, authored in MDX. It builds to fully static HTML (zero JS by default, Pagefind search, dark mode) and is **LLM-native** — every page exposes a "Copy as Markdown" / "Open in ChatGPT/Claude" toolbar and the site emits an `/llms.txt`.

This package is `private` — it is **not published to npm** and not part of the deck-authoring toolchain. It is the content; `@liebstoeckel/docs-dist` is the nginx container image that serves the build.

## Install

```sh
bun install            # from the repo root (workspace install)
```

> Requires **Bun ≥ 1.3**. Astro runs under Bun via `bun --bun`.

## Usage

```sh
bun run dev            # astro dev — local site with HMR at http://localhost:4321
bun run build          # astro build → ./dist (static HTML + Pagefind index + llms.txt)
bun run preview        # astro preview — serve the built ./dist locally
bun run check          # astro check — type-check content & components
```

Author docs by adding/editing MDX under `src/content/docs/**`; new pages must be listed in the `sidebar` in `astro.config.mjs` to appear in navigation.

## Architecture

A standard Astro Starlight site — most of the package is **content**, not code. The whole site is configured in one file and the docs live as a single content collection.

| Path | Role |
|---|---|
| `astro.config.mjs` | The entire site config: `site: https://docs.liebstoeckel.app`, the Starlight integration (title, description, `customCss`, and the full `sidebar` tree), and the `starlight-page-actions` plugin (per-page Copy-as-Markdown / Open-in-LLM toolbar + `/llms.txt`, keyed off `baseUrl`). |
| `src/content.config.ts` | Defines the single `docs` collection via Starlight's `docsLoader()` + `docsSchema()`. |
| `src/content/docs/**` | All page content as `.mdx`, grouped by section: `guides/` (getting started, authoring, animated code, theming, mobile, live, relay, building, thumbnails), `concepts/` (architecture, rendering, state-model, testing), `plugins/` (overview, building, state-and-sync, server-plugins, testing), `reference/` (cli, engine-api, components), plus `index.mdx`. |
| `src/styles/theme.css` | Brand overrides for Starlight (loaded via `customCss`); pairs with the JetBrains Mono + Schibsted Grotesk fontsource packages. |
| `diagrams/*.drawio` → `public/diagrams/*.svg` | draw.io sources for the architecture / build-pipeline / live-sync / state-handling diagrams, exported to SVGs served from `public/` and embedded in the concept pages. |

Build output is plain static files in `dist/` (hashed `/_astro/` assets, a Pagefind search index, a `404.html`, and `llms.txt`). Sibling `@liebstoeckel/docs-dist` consumes exactly that `dist/` in a two-stage Docker build and serves it from nginx — this package never ships its own server.

## Docs

The built site: **[docs.liebstoeckel.app](https://docs.liebstoeckel.app)**

## License

[MPL-2.0](https://github.com/limond/liebstoeckel-app-public/blob/main/LICENSE)
