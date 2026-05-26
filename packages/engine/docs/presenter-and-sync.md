# Presenter view & sync

liebstoeckel syncs slide navigation (and follow-along) over **two transports**, chosen automatically:

- **standalone** (`.html`, no server) → `BroadcastChannel` between windows on one machine.
- **live** (`bunx liebstoeckel`) → a shared **Yjs** document over WebSocket, across devices.

See the [state model](../../../docs/state-model.md) for the whole picture; this page is the navigation/presenter detail.

## Opening the presenter view

Press **P**. The deck opens a second window at the same URL **plus `#presenter`**, preserving the query string (so a live presenter window keeps its `?t=<token>` and authenticates):

```
http://host/path?t=<token>#presenter
```

`Present` renders `PresenterView` whenever the hash contains `presenter` (standalone *or* live). It shows: the current slide, a next-slide preview, the slide's **speaker notes**, a step counter, an elapsed timer + wall clock, and Prev/Next.

## How the index syncs

Both `Deck` (audience) and `PresenterView` build the **same controller** and call `next()` / `prev()` / `setIndex()`:

```ts
const liveCtx = useLive();
const sync     = useDeckSync(count);                              // standalone (BroadcastChannel)
const liveDeck = useLiveDeck(liveCtx?.doc, count, canDrive);      // live (shared Yjs "deck" map)
const ctrl     = liveCtx?.live ? liveDeck : sync;
```

- **standalone — `useDeckSync`** broadcasts `{ index, step, total, startedAt }` on `BroadcastChannel("liebstoeckel")`. New windows send `request`; others reply, so the presenter window snaps to the live slide.
- **live — `useLiveDeck`** stores `{ index, step, total }` in a Yjs `deck` map. The presenter role drives (writes); **viewers follow** (`canDrive = false` → writes are no-ops). `next()`/`prev()` read the freshest doc state, so rapid keypresses never act on a stale step.

A live `Deck` shows a `● live · <role>` badge.

## Roles (live)

Role comes from the URL token, resolved server-side:

- **presenter** — drives navigation and can perform presenter-only plugin actions (e.g. close a poll).
- **viewer** — follows the presenter's slide and may still interact with plugin state (vote), but cannot drive nav.

The **presenter link** opens the audience `Deck` as the presenter (drive it / project it); pressing **P** there opens the confidence monitor. Both connect to the same session and stay in step. (Driving step reveals requires the audience `Deck` to be open — it owns the `<Step>` rendering and writes `total`; a monitor-only window degrades to slide-level advance.)

## Steps

`<Step>` reveals appear one at a time as you advance; once past the last step the slide advances. The **step count (`total`) and current `step`** are part of the synced controller state, so the **presenter view shows `step n/total`** while the audience just sees the reveals. (See [`api-reference`](./api-reference.md) for `Step` / `StepsProvider`.)

## Timer

The elapsed timer is **per-window** (the presenter's own clock) with a reset button — it is not shared across devices.

## Reconnect & late join

`connectLive` (the live WebSocket client) **auto-reconnects** with capped exponential backoff and re-pushes local state on reopen, so a wifi blip mid-talk recovers without a reload. A **liveness watchdog** force-reconnects if no frame arrives within `staleMs` (the server sends a periodic keepalive), catching silently-dead **half-open** sockets the browser won't `close`. The server hands any newcomer the **full current state**, so opening a link mid-session lands on the current slide with current plugin state.

## Transports at a glance

| | standalone | live |
|---|---|---|
| transport | `BroadcastChannel` | Yjs over WebSocket (via the live server) |
| reach | one machine, one browser profile | across devices on the network (LAN now; tunnel later) |
| presenter view | local confidence monitor | confidence monitor, in sync with all clients |
| plugins | fallback only | full shared-state interaction |
