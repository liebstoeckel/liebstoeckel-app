# Concepts

The engine is small and built from a few load-bearing ideas. Understanding these four explains everything else.

## 1. One app, two views — `Present`

A deck is a single app. `Present` decides which view to render based on the URL hash:

- normal window → `Deck` (the **audience** view, full-screen)
- `#presenter` → `PresenterView` (the **control room**)

```
main.tsx → <Present slides … />
                │
        location.hash.includes("presenter")?
          ├── no  → <Deck …/>            (what the room sees)
          └── yes → <PresenterView …/>   (what you see)
```

Pressing **P** in the audience window calls `window.open(location + "#presenter", …)`, so the presenter is just a second instance of the same app in presenter mode. Nothing is rendered twice in one window.

## 2. Fixed canvas — `ScaledStage`

Every slide is authored against a fixed **1280×720** logical canvas (`STAGE_W` × `STAGE_H`). `ScaledStage` measures its container and applies a single CSS `transform: scale(...)` to fit, centered and letterboxed.

Why this matters:
- **Predictable layout.** A `64px` heading is `64px` on every screen; you design once, it scales uniformly. No reflow surprises between a 13" laptop and a projector.
- **Pixel-identical previews.** The presenter's slide thumbnails are the *same* `ScaledStage` at a smaller scale, so what you preview is exactly what's projected.

```
┌ viewport (any size) ─────────────┐
│   ┌ 1280×720 canvas (scaled) ─┐  │   scale = min(w/1280, h/720)
│   │      your slide           │  │
│   └───────────────────────────┘  │
└──────────────────────────────────┘
```

## 3. Peer sync — `BroadcastChannel`

The audience and presenter windows are independent React trees that stay in step by broadcasting a tiny state object — `{ index, startedAt }` — over a same-origin `BroadcastChannel` named `"present-it"`. Either window can drive; there is no leader. A new window asks for the current state on open and snaps to the live slide.

See [Presenter view & sync](./presenter-and-sync.md) for the full protocol. (Same-browser only — it does not cross devices or machines.)

## 4. Single, self-contained output

`buildDeck` (Bun's `Bun.build` with `compile: true`) inlines **all** JS, CSS, fonts, and assets into one `.html` file — no server, no CDN, no runtime dependencies. A deck is an artifact you can email or drop on any static host. Authoring uses Bun's dev server with HMR. See [Building & dev](./building.md).

---

## Layering

```
@present-it/engine        routing · views · sync · scaling · persistence · build
        ├── @present-it/components   MDX map · Magic · Atmosphere
        └── @present-it/theme        tokens → @theme inline → Tailwind utilities, fonts
```

The engine never hardcodes a colour or font; it uses semantic Tailwind utilities (`bg-bg`, `text-primary`, `font-heading`) that resolve to the active brand's CSS variables. Swap `data-brand` and the whole deck — including the progress bar and presenter chrome — re-skins.
