# Presenter view & sync

## Opening it

Press **P** in the audience window. The engine opens a second window at the same URL plus `#presenter`; `Present` renders `PresenterView` there. Both windows share the same origin, so they sync automatically (below).

## What the presenter shows

- **On screen** — a live thumbnail of the current slide (the same `ScaledStage`, so it's pixel-accurate).
- **Next up** — a preview of the next slide (shrinks first when space is tight).
- **Speaker notes** — the current slide's `notes`, always visible and scrollable (it keeps a guaranteed minimum height; long notes scroll).
- **Clock** (wall time) and **Elapsed** timer, with a **Reset**.
- **Prev / Next** buttons, plus full keyboard control.

The layout is responsive: thumbnails are flexible boxes that yield height so the notes panel is never pushed off-screen.

## Keyboard

Both views use `useDeckNav`, so the same keys work whether the audience or presenter window is focused:

| Key | Action |
|-----|--------|
| `→` `Space` `PageDown` | next |
| `←` `PageUp` | previous |
| `Home` / `End` | first / last |
| `P` | open presenter (audience only) |
| `T` | cycle brand (if multiple) |
| `?` `h` / right-click | shortcuts overlay (audience) |

A clicker that emits arrow keys works out of the box from the presenter window.

## How sync works

State lives in `useDeckSync(count)`, called independently by each window. There is no server and no leader — the windows are peers talking over a `BroadcastChannel("present-it")`.

### Shared state

```ts
type DeckState = { index: number; startedAt: number };
```

- `index` — current slide
- `startedAt` — timestamp the timer began; elapsed is `now - startedAt`, so both windows agree on the time, regardless of when each opened.

### Messages

```ts
type Msg =
  | { type: "state"; index: number; startedAt: number }
  | { type: "request" };
```

### Protocol

1. **Drive.** `setIndex` (from a key or a Prev/Next button) updates local state *and* posts a `state` message. `resetTimer` posts a fresh `startedAt` the same way.
2. **Adopt.** Each window's `onmessage` copies an incoming `state` into its own state. An equality guard skips no-op updates, which also prevents echo loops.
3. **Handshake.** On mount a window posts `request`; any existing window replies with its current state. That's why opening the presenter mid-talk snaps straight to the live slide instead of slide 1.

```
  audience ──[state {index:4}]──▶ presenter   (adopts → both on slide 5)
  presenter ──[Next → state {index:5}]──▶ audience
  new window ──[request]──▶ existing ──[state]──▶ new window (snaps to live)
```

A `useRef` mirror of state lets the once-created message handler answer `request` with the latest values (no stale closure).

### Hook surface

```ts
const { index, startedAt, setIndex, resetTimer } = useDeckSync(slideCount);
setIndex(4);                 // jump
setIndex((n) => n + 1);      // relative
resetTimer();                // restart elapsed (broadcast)
```

## What is *not* synced (by design)

- **Brand** — each window sets its own `data-brand`. Single-brand decks therefore match; sync it yourself if you want multi-brand parity across windows.
- **Help overlay** — purely local UI.

## Limits

`BroadcastChannel` is **same-origin, same browser profile**: it syncs tabs and windows on one machine, not across devices. Remote control (drive from a phone) would need a WebSocket/server layer feeding the same `setIndex`.
