# @liebstoeckel/build

> The build core of liebstoeckel: bundles a deck into one self-contained HTML file and serves it in development with hot reload, on esbuild.

Part of [liebstoeckel](https://liebstoeckel.app), a code-first presentation framework. You write decks in MDX and TSX and build them into a single self-contained HTML file with no server or runtime dependencies. The same file works offline, and when you host it the deck runs a live session between the presenter and the audience. Built on Bun, React 19, Motion, and Tailwind v4.

> **Status: experimental, pre-1.0.** liebstoeckel is an evolving experiment, not yet production-ready. Before 1.0, breaking changes can land in any release without a major-version bump, so pin an exact version if you depend on it.

Most people drive it through `liebstoeckel build` and `liebstoeckel dev` in [@liebstoeckel/cli](https://www.npmjs.com/package/@liebstoeckel/cli). Use it directly to build or serve decks from your own tooling.

## Install

```sh
bun add @liebstoeckel/build
```

> Bun-native. It ships raw TypeScript and runs under **Bun ≥ 1.3**; bundling is done by [esbuild](https://esbuild.github.io), which comes with it.

## Usage

```ts
import { bundleDeck, checkDeck } from "@liebstoeckel/build";

// Does it build? Structured diagnostics, nothing written.
const { ok, diagnostics } = await checkDeck({ entry: "./index.html" });

// One self-contained file: JS, CSS, fonts and assets inlined, plus the plugin
// manifest, third-party license notices and the deck's own source.
await bundleDeck({ entry: "./index.html", outdir: "./dist", outfile: "my-talk.html" });
```

The dev server is a `fetch` handler plus a WebSocket handler for `Bun.serve`, mounted under any path:

```ts
import { createDeckDev } from "@liebstoeckel/build/dev";

const deck = await createDeckDev({ deckDir: ".", base: "/deck" });
Bun.serve({ fetch: async (req, server) => (await deck.fetch(req, server)) ?? new Response("not found", { status: 404 }), websocket: deck.websocket });
```

## Exports

| Entry | What |
|---|---|
| `@liebstoeckel/build` | `bundleDeck`, `checkDeck`, `collectDeckLicenses`, `buildPluginManifest`, `buildServerBundle`, the `local` profile, `bunfigProblems` |
| `@liebstoeckel/build/dev` | `createDeckDev(options)`: the dev server (`fetch`, `websocket`, `notify`, `ready`, `close`) and `prebuildDeps` |
| `@liebstoeckel/build/check` | static checks on deck source: `macroProblems`, `codeBlocks` |

## What the build does

- **Reads the deck's `index.html`**, resolves every module itself (package `exports`, `imports`, `browser`, symlinked installs) and loads it through one pipeline: MDX, `.code.md` code files and the deprecated `codeStory` macro (highlighted with Shiki at build time; nothing of the deck runs), and Tailwind v4 (the classes come from the module graph).
- **Bundles in two passes**: the first collects Tailwind's candidates, the second bundles with the generated stylesheet, minifies, and inlines everything into the HTML.
- **Paths are relative to the project** that holds the deck, so the same source builds to the same bytes on every machine and from any folder.
- A deck's own Bun plugins (`bunfig.toml`), other macros and Tailwind's `@plugin`/`@config` are errors that name the file.

The dev server transforms each module on its own, prebuilds the deck's dependencies once (cached in `.liebstoeckel/cache/deps/`) and serves them through an import map, pushes changes to the page over a WebSocket, and keeps component state with React Fast Refresh. A build error shows as an overlay in the page.

## Architecture

| Path | Role |
|---|---|
| `src/core/` | The core, plain TypeScript with no Bun APIs: the Files seam (`files.ts`: disk, snapshot, a gated tree), the resolver, the esbuild plugin, the load pipeline, MDX, Tailwind, the code step and code files, the HTML reader and inliner, the production build, the dev server's module core and the React Fast Refresh pass. esbuild comes in as a parameter. |
| `src/deck.ts` | The host build: `bundleDeck` and friends on native esbuild, with the extras a built deck carries. |
| `src/profile.ts` | The `local` and `hosted` profiles (the hosted one gates every read). |
| `src/dev/` | The dev server: HTTP and WebSocket handlers, the dependency prebuild, the page runtime and the error overlay. |
