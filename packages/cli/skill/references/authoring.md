# Slide authoring conventions

A deck is a project (under `presentations/<name>/`) with:

- `index.html` — the page shell (a `<div id="root">` + the entry script). Rarely edited.
- `main.tsx` — the **entry**: renders `<Present>` with the ordered slide list.
- `slides/NN-name.tsx` (or `.mdx`) — one file per slide.
- `charts/` — scaffolded components (owned source from `liebstoeckel add`). Most
  registry items are charts and land here, but `add` writes each item to its manifest's
  `target` (see `references/components.md`), so other component types may land elsewhere.
- `package.json`, `build.ts`, `server.ts`, `bunfig.toml`.

## A slide

A slide is a module with a **default-exported React component**, optionally a
**`notes`** export (presenter notes). The component renders onto a fixed
**1280×720** canvas that is scaled to fit (author at that size; don't set your own
viewport units for layout).

```tsx
// slides/02-growth.tsx
import { BarChart } from "../charts/BarChart";

export const notes = (
  <div><p>Revenue tripled; call out Q4.</p></div>
);

export default function Growth() {
  return (
    <div className="flex h-full w-full flex-col justify-center px-24">
      <h2 className="font-heading text-5xl text-text">Revenue grew 3×</h2>
      <BarChart data={[{ label: "Q1", value: 128 }, { label: "Q4", value: 384 }]} />
    </div>
  );
}
```

Use Tailwind classes and the brand tokens (`text-text`, `bg-surface`, `text-accent`,
`border-border`, `font-heading`, `font-mono`). Charts already read the brand palette.

## Wiring a slide into the deck (required)

A new slide file does nothing until it's listed in `main.tsx`. Add an import and put
it in the `slides` array **in display order**. To include a slide's `notes`, import it
as a namespace; for component-only, a default import is fine:

```tsx
// main.tsx
import * as intro from "./slides/01-intro";
import * as growth from "./slides/02-growth";   // namespace → carries `notes`

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Present title="Q4 Review" brands={["nocturne"]} slides={[intro, growth]} />
  </StrictMode>,
);
```

## Steps (progressive reveal)

Wrap content in `<Step>` (from `@liebstoeckel/engine`) to reveal it across key
presses:

```tsx
import { Step } from "@liebstoeckel/engine";
// …
<Step>▹ First point</Step>
<Step>▹ Second point</Step>
```

## Brands

`<Present brands={["nocturne"]} />` selects the active brand; `liebstoeckel new
--brand <brand>` sets the default. Re-theming a deck = change the brand; every
component and token follows. Don't hard-code hex colors — use tokens / `useBrandColors`.

## MDX slides

A slide can be `.mdx` instead of `.tsx` for prose-heavy content; it still
default-exports its content and may `export const notes`. Import components at the top
of the MDX as usual.
