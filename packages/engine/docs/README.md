# `@present-it/engine` — docs

The runtime for a present-it deck: slide routing, the audience view, the presenter view, cross-window sync, the fixed-canvas scaler, persistent stateful elements, and the single-file build helper. It is **brand-agnostic** — looks come from `@present-it/theme`; primitives from `@present-it/components`.

## Contents

- [Concepts](./concepts.md) — the mental model: `Present` routing, the fixed canvas, peer sync, single-file output.
- [Slides & notes](./slides-and-notes.md) — authoring slides in TSX/MDX and attaching speaker notes.
- [Presenter view & sync](./presenter-and-sync.md) — the presenter window, keyboard control, and how `BroadcastChannel` keeps windows in step.
- [Persistent elements](./persistent-elements.md) — `Slot` / `PersistentLayer` for iframes, video, and live apps that travel between slides without reloading.
- [Building & dev](./building.md) — `buildDeck`, the dev server, single-file output, and the Bun/visx gotchas.
- [API reference](./api-reference.md) — every export, with signatures.

## 30-second tour

```tsx
// presentations/<deck>/main.tsx
import { createRoot } from "react-dom/client";
import { Present } from "@present-it/engine";
import "@present-it/theme/styles.css";

import * as title from "./slides/01-title";   // `import *` carries the `notes` export
import * as chart from "./slides/02-chart";

createRoot(document.getElementById("root")!).render(
  <Present title="My talk" brands={["nocturne"]} slides={[title, chart]} />,
);
```

```tsx
// slides/02-chart.tsx
export const notes = <p>What to say while this slide is up.</p>;
export default function Chart() {
  return <GradientArea />;   // any React component
}
```

| Key | Action |
|-----|--------|
| `→` `Space` `PageDn` | next |
| `←` `PageUp` | previous |
| `Home` / `End` | first / last |
| `P` | open the presenter window |
| `T` | cycle brand (if the deck declares more than one) |
| `?` / `h` / right-click | toggle the shortcuts overlay |
