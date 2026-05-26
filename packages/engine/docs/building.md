# Building & dev

## Dev server (HMR)

Each deck ships a `server.ts` that serves its `index.html` with hot reload + React Fast Refresh:

```ts
// presentations/<deck>/server.ts
import index from "./index.html";
Bun.serve({ routes: { "/": index }, development: { hmr: true }, hostname: "0.0.0.0", port: 3001 });
```

```bash
bun run showcase:dev     # → http://localhost:3001
```

Tailwind and MDX run as **dev-server plugins**, declared in the deck's `bunfig.toml`:

```toml
[serve.static]
plugins = ["bun-plugin-tailwind", "../../packages/engine/src/build/mdx-plugin.ts"]
```

> **HMR caveat:** Bun's dev server hot-reloads files inside the deck folder, but does **not** re-bundle changes to a workspace *package* (`packages/engine`, `packages/components`, `packages/theme`) on the fly. After editing engine/theme source, **restart** the dev server. Production builds always rebuild everything.

## Production build → one file

Plugins (Tailwind, MDX) run only through the **`Bun.build()` JS API**, not the `bun build` CLI. So a deck has a tiny `build.ts` that calls the engine's `buildDeck`:

```ts
// presentations/<deck>/build.ts
import { buildDeck } from "@liebstoeckel/engine/build";
await buildDeck({ entry: "./index.html", outdir: "./dist" });
```

```bash
bun run showcase:build   # → presentations/visx-showcase/dist/index.html
```

`buildDeck` runs `Bun.build` with `target: "browser"` + `compile: true`, which inlines JS into `<script>`, CSS into `<style>`, and **fonts/images as base64 `data:` URIs** — a single self-contained `.html` with no external references and no runtime deps.

```ts
buildDeck(opts?: {
  entry?: string;    // default "./index.html"
  outdir?: string;   // default "./dist"
  minify?: boolean;  // default true
}): Promise<Bun.BuildOutput>   // throws on failure
```

Self-hosted fonts are referenced from CSS by bare specifier and inlined at build:

```css
src: url("@fontsource-variable/fraunces/files/fraunces-latin-opsz-normal.woff2") format("woff2");
```

Base64 adds ~33% over the raw bytes — keep large videos external if size matters. Typical deck weight: React + Motion baseline ~540 KB; the visx showcase (3 fonts + charts) ~850 KB.

## The MDX plugin

`@liebstoeckel/engine/mdx-plugin` is a Bun plugin that compiles `.mdx` → JS via `@mdx-js/mdx` (`jsxImportSource: "react"`, `providerImportSource: "@mdx-js/react"`, loader `js`). `buildDeck` already includes it; the dev server picks it up from `bunfig.toml`.

## Working with visx (or other CJS libs)

Bun's bundler mishandles some visx packages' CommonJS exports. Two patterns avoid it:

- **Render custom SVG axes** instead of `@visx/axis` — its internal `@visx/text` dependency resolves to an object under the bundler and crashes the chart. `@visx/shape`, `@visx/scale`, `@visx/gradient`, `@visx/group`, `@visx/curve` are fine.
- **Generate chart data inline** rather than importing `@visx/mock-data` — its default export isn't an array at module-eval time in the bundle.

(These are documented findings from the showcase, not engine limitations.)
