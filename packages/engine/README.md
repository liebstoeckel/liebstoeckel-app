# @liebstoeckel/engine

> The compiler, React runtime, and single-file build pipeline at the core of liebstoeckel.

Part of [liebstoeckel](https://liebstoeckel.app), a code-first presentation framework. You write decks in MDX and TSX and build them into a single self-contained HTML file with no server or runtime dependencies. The same file works offline, and when you host it the deck runs a live session between the presenter and the audience. Built on Bun, React 19, Motion, and Tailwind v4.

> **Status: experimental, pre-1.0.** liebstoeckel is an evolving experiment, not yet production-ready. Before 1.0, breaking changes can land in any release without a major-version bump, so pin an exact version if you depend on it.

`engine` compiles your MDX and TSX slides into a deck, renders them with Motion transitions and keyboard and touch navigation, and bundles the markup, styles, and client runtime into a single HTML file. It also carries the live-mode client that syncs the presenter and audience over Yjs and the tokenizer for animated code. Most people drive it through [@liebstoeckel/cli](https://www.npmjs.com/package/@liebstoeckel/cli); the build itself is [@liebstoeckel/build](https://www.npmjs.com/package/@liebstoeckel/build).

## Install

```sh
bun add @liebstoeckel/engine
bun add react react-dom yjs   # peers you provide
```

> Bun-native. It ships raw TypeScript and runs under **Bun ≥ 1.3**.

## Usage

```tsx
// main.tsx — the deck entry, mounted by index.html
import { createRoot } from "react-dom/client";
import { Present } from "@liebstoeckel/engine";
import "@liebstoeckel/theme/styles.css";

import Intro from "./slides/intro.mdx";
import Hello from "./slides/hello.tsx";

createRoot(document.getElementById("root")!).render(
  <Present slides={[Intro, Hello]} brands={["acme"]} />,
);
```

Each slide is its own MDX or TSX module; `Present` orders them, renders Motion
transitions, and (when hosted) runs the live presenter↔audience session.

Build it with `liebstoeckel build` (or `bundleDeck` from
[`@liebstoeckel/build`](https://www.npmjs.com/package/@liebstoeckel/build)), which
writes one self-contained HTML file.

## Exports

| Entry | What |
|---|---|
| `@liebstoeckel/engine` | Runtime: `Present`, `Deck`, `PresenterView`, `ScaledStage` / `SlideFrame`, `Step` / `StepsProvider` / `useRevealState`, `CodeMagic`, `Magic` / `Atmosphere`, `useDeckSync` / `useDeckNav`, and the live re-exports (`Plugin`, `LiveProvider`, `useLive`, …) |
| `@liebstoeckel/engine/live` | Live-mode client runtime (Yjs sync) |
| `@liebstoeckel/engine/build/licenses`, `/build/source-package`, `/build/font-audit`, `/build/thumbnails`, `/build/capture-protocol`, `/build/visual-audit` | Pieces a built deck carries (license notices, the embedded source, the thumbnail manifest) and the checks the build and the capture run, used by `@liebstoeckel/build` and the CLI |
| `@liebstoeckel/engine/code` | `codeStory`, `code`: the tokenizer for animated code. Imported `with { type: "macro" }` from a deck it still builds but is **deprecated**; write a `.code.md` file instead |
| `@liebstoeckel/engine/build` | **Deprecated**: `bundleDeck`, `checkDeck`, `collectDeckLicenses` on `Bun.build`, for a deck's own `build.ts`, one release; use `@liebstoeckel/build` |
| `@liebstoeckel/engine/mdx-plugin`, `/visx-esm-plugin` | **Deprecated** Bun plugins of that pipeline |

## Architecture

Three concerns live here: the pieces a built deck carries (`src/build/`), a React runtime (the top-level `src/*.tsx`), and a live and plugin layer (`src/live/`). The tokenizer for animated code (`src/code/`) sits alongside them.

- `build/licenses.ts`, `build/source-package.ts` and `build/thumbnails.ts` are the license notices, the embedded source package and the thumbnail manifest that `@liebstoeckel/build` puts into a built deck. `build/buildDeck.ts`, `build/mdx-plugin.ts` and `build/visx-esm-plugin.ts` are the deprecated `Bun.build` pipeline.
- `code/tokenize.ts` and `code/macro.ts` tokenize code states with Shiki into `TokenizedStep` literals for `<CodeMagic>` (the build calls them for `.code.md` files), which keeps Shiki and its grammars out of the runtime. A css-variables theme (`var(--shiki-token-*)`) binds the colors to the brand.
- `Present.tsx` is the single entry point. It detects live mode (`live/detect`), connects the shared Yjs doc, provides the `LiveProvider` context, and branches to `Deck`, `PresenterView`, or `CaptureView` (the build-time thumbnail capture, gated by `build/capture-protocol`).
- `Deck.tsx`, `Stage.tsx`, and `steps.tsx` render slides. `Deck` draws the active slide inside a fixed `STAGE_W` by `STAGE_H` `ScaledStage` (letterboxed), animates transitions with Motion `AnimatePresence`, and wires navigation through `nav.ts`. `StepsProvider`, `Step`, and `useRevealState` drive progressive reveals. Index and step state come from `useDeckSync` (a BroadcastChannel, standalone) or `live/deckIndex` (Yjs, live).
- `live/` holds the live client. `connect.ts` does auto-reconnecting WebSocket Yjs sync with a half-open watchdog, `Plugin.tsx` renders a plugin's Slide or fallback against the shared doc, and `breakout.tsx` turns a touch glow-tap into a sheet.

The engine re-exports `Magic` and `Atmosphere` from `@liebstoeckel/components`, reads brand tokens through `useTheme` in `@liebstoeckel/plugin-ui`, and uses the `--shiki-*` and `--brand-*` variables from `@liebstoeckel/theme` for on-palette code and atmosphere. Plugin discovery and manifest types come from `@liebstoeckel/plugin-sdk`.

## Upgrading from 0.3

Move every `@liebstoeckel/*` package of a deck to 0.4 together with `liebstoeckel update` (a plain `bun update` stays on 0.3). A deck bundles one copy of each package, so a deck that mixes 0.3 and 0.4 copies fails to build. Built decks now record the engine they bundle in their generator stamp, and a deck that names no `brands` gets the `liebstoeckel` house brand. What changed: [Upgrading to 0.4](https://docs.liebstoeckel.app/guides/upgrading-to-0-4/).

## Links

- [Engine API reference](https://docs.liebstoeckel.app/reference/engine-api/)
- [Building a deck](https://docs.liebstoeckel.app/guides/building/) and [animated code](https://docs.liebstoeckel.app/guides/animated-code/)
- [Homepage](https://liebstoeckel.app)
- [Source and issues](https://github.com/liebstoeckel/liebstoeckel-app)

Licensed under [MPL-2.0](https://github.com/liebstoeckel/liebstoeckel-app/blob/main/LICENSE).
