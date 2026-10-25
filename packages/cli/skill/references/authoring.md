# Slide authoring conventions

A deck is a project (under `presentations/<name>/`) with:

- `index.html` — the page shell (a `<div id="root">` + the entry script). Rarely edited.
- `main.tsx` — the **entry**: renders `<Present>` with the ordered slide list.
- `slides/NN-name.tsx` (or `.mdx`) — one file per slide.
- `charts/` — scaffolded components (owned source from `liebstoeckel add`). Most
  registry items are charts and land here, but `add` writes each item to its manifest's
  `target` (see `references/components.md`), so other component types may land elsewhere.
- `package.json` — its `dev` and `build` scripts call `liebstoeckel dev` and
  `liebstoeckel build`. There is no `build.ts`, `server.ts` or `bunfig.toml` (decks from
  before 0.4 lose them on the next `liebstoeckel dev`; see
  `references/migrations/0003-scaffold-tooling-files.md`).
- `slides/*.code.md` — optional code files for animated code (below).

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
it in the `slides` array **in display order**. To include a slide's `notes`,
`transition` or `backdropProps`, import it as a namespace; a default import passes
only the component and silently drops those exports. A default import is fine only
for a slide that exports nothing else:

```tsx
// main.tsx
import * as intro from "./slides/01-intro";
import * as growth from "./slides/02-growth";   // namespace → carries `notes`

// Keep the scaffolded hot-module pattern intact (hot.data root + accept()):
// it lets dev-mode slide edits apply without resetting the deck to slide 1.
const root = (import.meta.hot.data.root ??= createRoot(document.getElementById("root")!));
root.render(
  <StrictMode>
    <Present title="Q4 Review" brands={["nocturne"]} slides={[intro, growth]} />
  </StrictMode>,
);
import.meta.hot.accept();
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

To **create a custom brand** (typed `defineTheme` in `brands/<name>.ts` wired via
`brandThemes`) and bundle its fonts, see `references/brands.md`.

## Backdrop

`<Present backdrop={Sky} />` sets the decoration behind every slide (omit it for
the default atmosphere, `null` for a flat background). A backdrop component gets
`still` (thumbnails, overview, print, capture, presenter previews: render a
motionless frame), `slide` (0-based index of the slide it is drawn behind) and its
own props, which a slide sets with `export const backdropProps = { palette: "dusk" }`.
Type it as `BackdropComponent<SkyProps>` from `@liebstoeckel/engine`, every own
prop optional, and annotate the slide's export (`export const backdropProps: SkyProps`),
since nothing else checks it. The slide must be imported as a namespace
(`import * as dusk from "./slides/05-dusk"`) or the export is dropped. Use `backdropProps` for anything tied to a slide (a palette, a
scene): it moves with the slide when the deck is reordered. Use `slide` only for
progress. Animate only `transform` and `opacity` (CSS keyframes or transitions).
Full example: the authoring guide in the docs, "The deck's backdrop".

## MDX slides

A slide can be `.mdx` instead of `.tsx` for prose-heavy content; it still
default-exports its content and may `export const notes`. Import components at the top
of the MDX as usual.

## Animated code (code files)

Fenced code blocks in MDX are highlighted at build time. For code that changes
step by step, write the states into a **code file**, `slides/<name>.code.md`, one
fenced block per state (the fence's language highlights it; text outside the
fences is ignored), and pass its import to `<CodeMagic>`:

````md
```ts
function greet(name) {}
```

```ts
function greet(name: string) {}
```
````

```tsx
import { CodeMagic } from "@liebstoeckel/engine";
import greet from "./greet.code.md";

export default function CodeSlide() {
  return <CodeMagic title="greet.ts" steps={greet} />;
}
```

Each state after the first takes one step (one press). Do not write new
`codeStory` macro calls: they still build but are deprecated; when you touch a
slide that uses one, suggest moving its states into a code file. No other macro builds.
