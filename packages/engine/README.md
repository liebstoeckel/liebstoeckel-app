# @liebstoeckel/engine

> The compiler, React runtime, and single-file build pipeline at the core of liebstoeckel.

Part of [liebstoeckel](https://liebstoeckel.app), a code-first presentation framework. You write decks in MDX and TSX and build them into a single self-contained HTML file with no server or runtime dependencies. The same file works offline, and when you host it the deck runs a live session between the presenter and the audience. Built on Bun, React 19, Motion, and Tailwind v4.

> Pre-release software. The API can still change.

`engine` compiles your MDX and TSX slides into a deck, renders them with Motion transitions and keyboard and touch navigation, and bundles the markup, styles, and client runtime into a single HTML file. It also carries the live-mode client that syncs the presenter and audience over Yjs, plus a build-time macro for animated code. Most people drive it through [@liebstoeckel/cli](https://www.npmjs.com/package/@liebstoeckel/cli). Install it directly when you want to run the build yourself.

## Install

```sh
bun add @liebstoeckel/engine
bun add react react-dom yjs   # peers you provide
```

> Bun-native. It ships raw TypeScript and builds under **Bun ≥ 1.3**. The `./code` export is a **Bun macro**, so the build has to run under Bun.

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
// build.ts: compile the deck to a single HTML file
import { buildDeck } from "@liebstoeckel/engine/build";

await buildDeck({ entry: "./slides.tsx", outDir: "dist", title: "My deck" });
// writes dist/index.html
```

## Exports

| Entry | What |
|---|---|
| `@liebstoeckel/engine` | Runtime: `Presentation`, `Slide`, `useDeck`, `ThemeProvider` / `useTheme`, `definePlugin`, `builtinPlugins` |
| `@liebstoeckel/engine/build` | `buildDeck(options)` writes self-contained HTML. Options: `entry`, `outDir`, `title`, `plugins`, `base`, `theme`, `thumbnails` |
| `@liebstoeckel/engine/live` | Live-mode client runtime (Yjs sync) |
| `@liebstoeckel/engine/code` | The **Bun macro** for build-time syntax highlighting (animated code) |
| `@liebstoeckel/engine/mdx-plugin` | The MDX build plugin |

## Architecture

Three concerns live here: a build pipeline (`src/build/`), a React runtime (the top-level `src/*.tsx`), and a live and plugin layer (`src/live/`). A build-time `code` macro (`src/code/`) sits alongside them.

- `build/buildDeck.ts` drives `Bun.build({ target: "browser", compile: true })` with the `tailwind` and `mdx` plugins, so the JS and CSS inline into one HTML file. It then post-processes the output. `escapeInlineModuleScript` neutralizes any `</script>` inside the inlined bundle, and `embedManifest` injects the base64 plugin manifest (server bundles come from `buildServerBundle`).
- `build/mdx-plugin.ts` is a `BunPlugin` that compiles `.mdx` with the automatic React runtime and the `@mdx-js/react` provider. Fenced code is highlighted by Shiki at build time using a css-variables theme (`var(--shiki-token-*)`), so no highlighter ships to the browser.
- `code/macro.ts` (the `./code` Bun macro) and `code/tokenize.ts` handle animated code. `codeStory` and `code` tokenize source at build time into `TokenizedStep` literals for `<CodeMagic>`, which keeps Shiki and its grammars out of the runtime.
- `Present.tsx` is the single entry point. It detects live mode (`live/detect`), connects the shared Yjs doc, provides the `LiveProvider` context, and branches to `Deck`, `PresenterView`, or `CaptureView` (the build-time thumbnail capture, gated by `build/capture-protocol`).
- `Deck.tsx`, `Stage.tsx`, and `steps.tsx` render slides. `Deck` draws the active slide inside a fixed `STAGE_W` by `STAGE_H` `ScaledStage` (letterboxed), animates transitions with Motion `AnimatePresence`, and wires navigation through `nav.ts`. `StepsProvider`, `Step`, and `useRevealState` drive progressive reveals. Index and step state come from `useDeckSync` (a BroadcastChannel, standalone) or `live/deckIndex` (Yjs, live).
- `live/` holds the live client. `connect.ts` does auto-reconnecting WebSocket Yjs sync with a half-open watchdog, `Plugin.tsx` renders a plugin's Slide or fallback against the shared doc, and `breakout.tsx` turns a touch glow-tap into a sheet.

The engine re-exports `Magic` and `Atmosphere` from `@liebstoeckel/components`, reads brand tokens through `useTheme` in `@liebstoeckel/plugin-ui`, and uses the `--shiki-*` and `--brand-*` variables from `@liebstoeckel/theme` for on-palette code and atmosphere. Plugin discovery and manifest types come from `@liebstoeckel/plugin-sdk`.

## Links

- [Engine API reference](https://docs.liebstoeckel.app/reference/engine-api/)
- [Building a deck](https://docs.liebstoeckel.app/guides/building/) and [animated code](https://docs.liebstoeckel.app/guides/animated-code/)
- [Homepage](https://liebstoeckel.app)
- [Source and issues](https://github.com/liebstoeckel/liebstoeckel-app)

Licensed under [MPL-2.0](https://github.com/liebstoeckel/liebstoeckel-app/blob/main/LICENSE).
