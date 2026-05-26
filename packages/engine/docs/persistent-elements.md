# Persistent elements

For the few elements whose **internal state must survive slide changes** — an `<iframe>`, a `<video>`, a WebGL canvas, a live React app — the engine keeps them mounted once and *moves them* between slides instead of re-rendering them per slide.

## The problem with portals

The obvious approach — `createPortal` the element into a different container per slide, or `react-reverse-portal` — **re-parents the DOM node**. Per the HTML spec, removing an `<iframe>` from the document and re-inserting it **reloads it** (state lost, video restarts, WebGL context dropped). So we do the opposite: never move the node; animate its *position* onto each slide's slot.

## The API

Two pieces:

1. Declare the element **once** on the deck:

```tsx
<Present
  persistent={[{ id: "demo", render: () => <LiveIframe /> }]}
  slides={[…]}
/>
```

2. Drop a `<Slot>` placeholder wherever it should appear, on any slide (TSX or MDX):

```tsx
// slides/02.tsx
import { Slot } from "@liebstoeckel/engine";
export default () => (
  <div className="flex gap-8">
    <Caption>Watch the clock keep running →</Caption>
    <Slot id="demo" className="h-64 w-96" />
  </div>
);
```

Use the **same `id`** on consecutive slides at different sizes/positions and the element **travels** there — Motion `layout` FLIP-animates the box. On a slide with no matching slot, it fades out. The DOM node never re-parents, so an iframe's clock, a video's playback, etc. continue uninterrupted.

```ts
type PersistentItem = { id: string; render: () => ReactNode };
```

## How it works

- `PersistentProvider` (wrapped around the deck automatically by `Deck`) holds the live slot rectangles and ref-counts visibility.
- `<Slot id>` renders an empty placeholder, measures its box relative to `[data-deck-root]` via `ResizeObserver`, and reports it.
- `PersistentLayer` renders each `persistent` item **once** in an absolute overlay and animates it onto the active slot's rectangle.
- **Visibility is ref-counted.** Because slide transitions overlap (the incoming slot mounts before the outgoing one unmounts), the count never hits zero between adjacent slides that share an `id` → the element travels smoothly instead of blinking. With no slot, the count drops to zero and it fades out.

## Notes & limits

- Use this only for genuinely stateful elements — ordinary content should just be normal slide markup (or `Magic` for stateless "magic move" of a styled element).
- Presenter thumbnails render slides **without** the persistent layer, so a live iframe shows in the audience view, not in the small previews.
- Coordinates are measured relative to `[data-deck-root]` inside the scaled canvas, so persistent elements scale with the deck.
