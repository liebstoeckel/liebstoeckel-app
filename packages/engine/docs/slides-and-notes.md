# Slides & notes

## A slide is a module

A slide is any module with a default-exported React component. It may be **TSX** or **MDX** — mix them freely in one deck.

```tsx
// slides/03-area.tsx
export default function Area() {
  return <GradientArea />;
}
```

```mdx
{/* slides/01-title.mdx */}
# Markdown + React
Write prose, drop in **components**.
```

MDX maps `#`, `##`, `p`, `ul`, `code`, `strong`, … to themed components (see `@present-it/components`). Inside an `.mdx` file you can `import` anything:

```mdx
import { Slot } from "@present-it/engine";

## Live data
<Slot id="demo" />
```

## Speaker notes — the `notes` export

A slide attaches notes by exporting a `notes` value (string or JSX). It renders **only** in the presenter view, never on the audience slide.

```tsx
// TSX
export const notes = (
  <div>
    <p>The <strong>headline</strong> number — let it land.</p>
    <ul><li>Tie back to the campaign.</li></ul>
  </div>
);
export default function Stats() { /* … */ }
```

```mdx
{/* MDX */}
export const notes = "Open on the problem, not the product.";

# Title
```

Notes JSX is rendered inside a `.presenter-notes` container; the theme styles raw `p`/`ul`/`li`/`strong`/`code`/`kbd` there, so plain HTML elements look right without importing anything.

## Wiring slides into the deck — use `import *`

Because notes live as a *named* export alongside the *default* component, import each slide as a **namespace** so both travel together, then pass the list to `Present`:

```tsx
import * as title from "./slides/01-title";   // → { default, notes }
import * as stats from "./slides/02-stats";

<Present slides={[title, stats]} brands={["nocturne"]} title="My talk" />;
```

A bare component works too (no notes):

```tsx
import Title from "./slides/01-title";
<Present slides={[Title, stats]} />;   // mixed forms are fine
```

Under the hood `normalizeSlides` accepts either shape:

```ts
type SlideInput = ComponentType | { default: ComponentType; notes?: ReactNode };
```

## Slide layout

Slides render inside `SlideFrame` (brand background + `Atmosphere` + a padded, centered content area), which sits on the 1280×720 canvas. For full-bleed visuals, position with `absolute` inside your slide — the showcase title slide does this for its background chart. Author to 1280×720; `ScaledStage` handles the rest.
