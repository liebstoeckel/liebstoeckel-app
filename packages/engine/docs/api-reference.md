# API reference

All exports are from `@present-it/engine` unless noted. Build helpers live on subpaths.

## Components

### `Present(props: DeckProps)`
Top-level entry. Renders `Deck`, or `PresenterView` when the window URL contains `#presenter`. Use this, not `Deck`/`PresenterView`, directly.

### `Deck(props: DeckProps)`
The audience view: fixed-canvas stage, slide transitions (`AnimatePresence`), keyboard nav, progress bar + counter, persistent layer, and the help overlay. Wraps everything in `PersistentProvider` and `MDXProvider`.

### `PresenterView(props: DeckProps)`
The control room: current + next thumbnails, speaker notes, clock, elapsed timer, reset, prev/next. Syncs with the audience window.

```ts
type DeckProps = {
  slides: SlideInput[];          // ordered slides (TSX/MDX modules or components)
  persistent?: PersistentItem[]; // stateful elements that travel between slides
  brands?: string[];             // brand ids to cycle with "T"; first is default. default ["default"]
  title?: string;                // shown in the presenter header
};
```

```tsx
<Present title="My talk" brands={["nocturne"]} slides={[title, stats]} />
```

### `ScaledStage({ children, className? })`
Fits a fixed `STAGE_W`×`STAGE_H` canvas into its parent via `transform: scale`, centered + letterboxed. Pass `className` to size/position it (`h-screen w-screen` for full-screen, `absolute inset-0` to fill a relative box).

### `SlideFrame({ children, atmosphere? })`
The visual frame of a slide: brand background, optional `Atmosphere`, and a padded centered content area. `atmosphere` defaults to `true`.

### `STAGE_W` / `STAGE_H`
The logical canvas size — `1280` × `720`. Author against these.

### `HelpOverlay({ open, onClose, showBrand? })`
The keyboard-shortcuts modal. `Deck` renders and wires this for you; exported for custom chrome. `showBrand` shows the brand-cycle row.

### `Magic({ id, className?, children? })` — _from `@present-it/components`_
Stateless "magic move": a persistent `motion.div` with `layout` + `layoutId`. Same `id` on consecutive slides morphs the element's box. For *stateful* elements use `Slot` instead.

### `Atmosphere()` — _from `@present-it/components`_
Decorative background: drifting gradient blooms, film grain, vignette. Brand-aware via `--brand-glow-*`.

## Persistence

### `PersistentProvider({ children })`
Context holding live slot rectangles + ref-counted visibility. `Deck` includes it automatically.

### `Slot({ id, className? })`
A placeholder that reserves space and reports its box. Same `id` across slides makes the matching persistent element travel there.

### `PersistentLayer({ items })`
Renders each `PersistentItem` once and animates it onto the active slot. Rendered by `Deck`.

```ts
type PersistentItem = { id: string; render: () => ReactNode };
```

See [Persistent elements](./persistent-elements.md).

## Hooks

### `useDeckSync(count: number)`
Cross-window state over `BroadcastChannel`.

```ts
const { index, startedAt, setIndex, resetTimer } = useDeckSync(count);
// index: number          current slide
// startedAt: number      timer start (ms epoch); elapsed = Date.now() - startedAt
// setIndex(n | (n)=>n)    set/jump slide (clamped, broadcast)
// resetTimer()           restart elapsed (broadcast)
```

### `useDeckNav(opts)`
Binds keyboard navigation to `window`.

```ts
useDeckNav({
  count: number,
  setIndex: (updater: number | ((n: number) => number)) => void,
  onToggleBrand?: () => void,    // "T"
  onOpenPresenter?: () => void,  // "P"
  onToggleHelp?: () => void,     // "?" / "h"
});
```
Arrows / Space / PageUp / PageDown / Home / End map to navigation.

## Slides

### `normalizeSlides(slides: SlideInput[]): NormalizedSlide[]`
Coerces each slide to `{ Component, notes? }`, accepting either a bare component or a module namespace with a `notes` export.

```ts
type SlideInput = ComponentType | { default: ComponentType; notes?: ReactNode };
type NormalizedSlide = { Component: ComponentType; notes?: ReactNode };
```

## Build (subpaths)

### `buildDeck(opts?)` — _from `@present-it/engine/build`_
Builds a deck to a single self-contained `.html` (Bun.build, `compile: true`, Tailwind + MDX plugins). Throws on failure.

```ts
buildDeck(opts?: {
  entry?: string;   // default "./index.html"
  outdir?: string;  // default "./dist"
  minify?: boolean; // default true
}): Promise<Bun.BuildOutput>
```

### default export — _from `@present-it/engine/mdx-plugin`_
The Bun plugin compiling `.mdx` → JS. Reference it in a deck's `bunfig.toml` for the dev server; `buildDeck` includes it automatically.

See [Building & dev](./building.md).

## Live session & plugins

These power the live, multi-device layer. Also exported from `@present-it/engine/live`. See the [state model](../../../docs/state-model.md), [presenter & sync](./presenter-and-sync.md), and [plugins](../../plugin-sdk/docs/README.md).

### `Plugin({ id, props?, components? })`
Places a plugin in a slide. Renders the plugin's `Slide` when a server is connected, else its `fallback`. `props` is per-instance author config; `components` overrides named surfaces.

### `LiveProvider({ value, children })` / `useLive()`
Context carrying `{ live, role, participant, doc, theme, viewerUrl, plugins }`. `Present` provides it; `useLive()` reads it (null outside).

### `detectLive(): LiveInfo | null`
Reads the server-injected `window.__PRESENT_IT_LIVE__` (`{ ws, session, role, token, viewer }`); `null` → standalone.

### `connectLive(info, participant, opts?): LiveConnection`
Connects a Yjs `doc` to the server over WebSocket with **auto-reconnect** (capped backoff) and a guarded message path. `opts`: `{ WS?, reconnectBaseMs?, reconnectMaxMs? }`. Returns `{ doc, onStatus(cb), close() }`.

### `useLiveDeck(doc, count, canDrive): DeckController`
Live nav state backed by the shared `deck` map: `{ index, step, total, canDrive, setIndex, setStep, setTotal, next, prev }`. `canDrive=false` (viewer) makes writes no-ops → follow-along. `next`/`prev` read the freshest doc state.

### `getParticipantId(storage?)`
Stable per-browser-session id (sessionStorage), with a non-secure-context fallback.

### `getDeckIndex(doc)` / `setDeckIndex(doc, n)` / `mergeUi(base, over?)`
Low-level helpers (shared-doc index access; surface-override merge).

## Live delivery

### `Step` / `StepsProvider` — _from `@present-it/engine`_
Progressive reveals. `<Step>` hides until the deck's `step` reaches its order. `StepsProvider` (rendered by `Deck`) counts the steps and reports `total` (gated by slide index, via layout effects, so a fast keypress can't skip a slide's builds).

### `delivery` helpers — _from `@present-it/engine`_
Pure nav logic: `stepForward(step, total)`, `stepBack(step)`, `accumulateDigits(buffer, key)` (jump-to-slide), `clampIndex`, `fullscreenAction` / `toggleFullscreen(el)`.

Deck keys: `→`/`Space` next (reveal step) · `←` prev · `Home`/`End` · `0-9`↵ jump · `O` overview · `F` fullscreen · `B` blur-screen · `Q` join-QR · `P` presenter · `?` help.
