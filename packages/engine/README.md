# @liebstoeckel/engine

> The compiler, React runtime, and single-file build pipeline at the core of liebstoeckel.

Part of **[liebstoeckel](https://liebstoeckel.app)** — a code-first presentation framework: author decks in **MDX + TSX**, get one self-contained HTML file that's animated, interactive, and live-shareable. Built on **Bun + React 19 + Motion + Tailwind v4**.

> ⚠️ Pre-release (`0.0.0`). APIs may change.

`engine` compiles your MDX/TSX slides into a deck, renders them with Motion transitions and keyboard/touch navigation, and bundles everything — markup, styles, and the client runtime — into a single HTML file. It also hosts the live-mode client (Yjs presenter↔audience sync) and a build-time animated-code macro. Most people drive it through **@liebstoeckel/cli**; install it directly when you want to run the build yourself.

## Install

```sh
bun add @liebstoeckel/engine
bun add react react-dom yjs   # peers — you provide these
```

> Bun-native: ships raw TypeScript and builds under **Bun ≥ 1.3**. The `./code` export is a **Bun macro**, so the build must run under Bun.

## Usage

```tsx
// slides.tsx
import { Presentation, Slide } from "@liebstoeckel/engine";

export default (
  <Presentation>
    <Slide><h1>Hello, liebstoeckel</h1></Slide>
    <Slide><h2>One file. Animated. Live.</h2></Slide>
  </Presentation>
);
```

```ts
// build.ts — compile the deck to a single HTML file
import { buildDeck } from "@liebstoeckel/engine/build";

await buildDeck({ entry: "./slides.tsx", outDir: "dist", title: "My deck" });
// → dist/index.html
```

## Exports

| Entry | What |
|---|---|
| `@liebstoeckel/engine` | Runtime: `Presentation`, `Slide`, `useDeck`, `ThemeProvider` / `useTheme`, `definePlugin`, `builtinPlugins` |
| `@liebstoeckel/engine/build` | `buildDeck(options)` → self-contained HTML. Options: `entry`, `outDir`, `title`, `plugins`, `base`, `theme`, `thumbnails` |
| `@liebstoeckel/engine/live` | Live-mode client runtime (Yjs sync) |
| `@liebstoeckel/engine/code` | **Bun macro** for build-time syntax highlighting (animated code) |
| `@liebstoeckel/engine/mdx-plugin` | The MDX build plugin |

## Architecture

Three concerns live here: a **build pipeline** (`src/build/`), a **React runtime** (top-level `src/*.tsx`), and a **live/plugin layer** (`src/live/`), plus a build-time **code** macro (`src/code/`).

- **`build/buildDeck.ts`** — drives `Bun.build({ target:"browser", compile:true })` with the `tailwind` + `mdx` plugins so JS/CSS inline into one HTML. Post-processes the output: `escapeInlineModuleScript` neutralizes `</script>` inside the inlined bundle, then `embedManifest` injects the base64 plugin manifest (server bundles built via `buildServerBundle`).
- **`build/mdx-plugin.ts`** — `BunPlugin` compiling `.mdx` with the automatic React runtime + `@mdx-js/react` provider; fenced code is Shiki-highlighted at build time using a **css-variables** theme (`var(--shiki-token-*)`), so no highlighter ships to the browser.
- **`code/macro.ts`** (the `./code` Bun macro) → `code/tokenize.ts` — `codeStory`/`code` tokenize source at build time into `TokenizedStep` literals for `<CodeMagic>`; Shiki/grammars are stripped from the runtime.
- **`Present.tsx`** — single entry. Detects live mode (`live/detect`), connects the shared Yjs doc, provides `LiveProvider` context, and branches to `Deck`, `PresenterView`, or `CaptureView` (build-time thumbnail capture, gated by `build/capture-protocol`).
- **`Deck.tsx` + `Stage.tsx` + `steps.tsx`** — `Deck` renders the active slide inside a fixed `STAGE_W×STAGE_H` `ScaledStage` (letterboxed), animates transitions with Motion `AnimatePresence`, and wires nav (`nav.ts`). `StepsProvider`/`Step`/`useRevealState` drive progressive reveals; index/step state comes from `useDeckSync` (BroadcastChannel, standalone) or `live/deckIndex` (Yjs, live).
- **`live/`** — `connect.ts` (auto-reconnecting WebSocket Yjs sync with a half-open watchdog), `Plugin.tsx` (`<Plugin>` renders a plugin's Slide/fallback against the shared doc), `breakout.tsx` (touch glow-tap → sheet).

It re-exports `Magic`/`Atmosphere` from **@liebstoeckel/components**, reads brand tokens via **@liebstoeckel/plugin-ui**'s `useTheme`, and consumes **@liebstoeckel/theme**'s `--shiki-*`/`--brand-*` vars for on-palette code and atmosphere. Plugin discovery/manifest types come from **@liebstoeckel/plugin-sdk**.

## Docs

**[liebstoeckel.app/reference/engine-api](https://docs.liebstoeckel.app/reference/engine-api/)** · [building](https://docs.liebstoeckel.app/guides/building/) · [animated code](https://docs.liebstoeckel.app/guides/animated-code/)

## License

[MPL-2.0](https://github.com/liebstoeckel/liebstoeckel-app/blob/main/LICENSE)
