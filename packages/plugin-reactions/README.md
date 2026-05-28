# @liebstoeckel/plugin-reactions

> Floating emoji reactions for liebstoeckel decks.

The audience taps emoji (👏 ❤️ 🎉 🔥 😮 💡) and they float up, drift, and fade over the deck — a
lightweight ambient backchannel. Emits are rate-limited per viewer and the live set is capped and
auto-pruned to keep shared state bounded. Syncs over the deck's [Yjs](https://yjs.dev) session.

Part of **[liebstoeckel](https://liebstoeckel.app)** — a code-first framework for animated,
single-file HTML presentations (Bun · React 19 · Motion · Tailwind v4 · MDX). Requires
[Bun](https://bun.sh); ships as raw TypeScript.

## Install

```sh
bun add @liebstoeckel/plugin-reactions
```

Peer dep: `react`. (Pulls in `@liebstoeckel/plugin-sdk`, `@liebstoeckel/plugin-ui`, and `motion`.)

## Usage

```tsx
import { Plugin } from "@liebstoeckel/engine";

export default () => <Plugin id="reactions" />;
```

Run the deck live (`liebstoeckel live …`); reactions are symmetric — there's no presenter-only panel.

## Exports

- `.` — the reactions plugin (default export, `id: "reactions"`)
- `./logic` — pure helpers + schema: `reactionsSchema`, `EMOJI`, `MAX_ENTRIES`, `recent`, `expired`, `allowEmit`, `overCapIds`, types `ReactionsState` / `Reaction`

## Architecture

A pure-CRDT plugin (no `server` part) with deliberately **ephemeral** shared state — clients prune entries so the doc never accumulates history.

- **`logic.ts`** — framework-free schema + derivations. `reactionsSchema = schema({ reactions: t.record(t.object({ emoji, pid, ts })) })`; each record entry is one reaction burst keyed by a generated id. `recent(state, now, windowMs=4000)` returns entries still inside the visible window (oldest→newest), `expired` returns ids aged out, `overCapIds` returns ids beyond `MAX_ENTRIES` (60), and `allowEmit(lastEmitAt, now)` is the per-viewer rate-limit predicate (250ms). `EMOJI` is the palette.
- **`client.tsx`** — `definePlugin<ReactionsState>({ id: "reactions", state: reactionsSchema, client: {...} })`. Symmetric — there is **only** a `Slide`, no presenter panel. Tapping an emoji calls `state.recordSet("reactions", crypto.randomUUID(), { emoji, pid, ts })` after the `allowEmit` check. A 1s interval prunes `expired` + `overCapIds` via `recordDelete` and re-ticks `recent()` so floaters unmount through `AnimatePresence`. `Floater` animates each emoji rising/drifting/fading with Motion; per-id `jitter()` gives deterministic, stable drift/tilt/scale.
- **Standalone vs live:** with a server connected, reactions broadcast and float for everyone. Offline (standalone `.html` + thumbnail), the `fallback` renders a static, dimmed, non-interactive row of the palette with a hint.
- Builds on **plugin-sdk** (`definePlugin`, `schema`/`t`, record state API, `ClientProps`) and **plugin-ui** (`Card`, `Eyebrow`); the float layer and buttons are styled inline against `--brand-*` variables.

## Docs

- Plugins overview — https://liebstoeckel.app/plugins/overview/
- Live presenting — https://liebstoeckel.app/guides/live/

MPL-2.0
