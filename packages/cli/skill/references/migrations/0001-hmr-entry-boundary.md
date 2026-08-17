---
id: 0001-hmr-entry-boundary
title: HMR-preserving deck entry boundary
since: 0.4.0
surface: entry
reason: slide edits in dev mode reset the deck to slide 1 unless the entry is an import.meta.hot boundary with a persisted root
---

# HMR-preserving deck entry boundary

## Why

In dev mode (`liebstoeckel dev`), editing a slide hot-reloads it. But a slide
that exports `notes`, or any compiled MDX slide, breaks React Fast Refresh's
boundary rules, so the update propagates up to the deck entry. An entry that
just calls `createRoot(...).render(...)` re-runs from scratch on every such
update: the page fully reloads and the deck jumps back to slide 1, losing the
current slide and step mid-iteration.

The fix makes the entry itself the hot-module boundary: it self-accepts and
renders into a React root persisted in `import.meta.hot.data`, so a slide edit
re-runs the entry into the SAME root. React reconciles, the deck keeps its
state, and only the edited slide remounts. `bun build` compiles the
`import.meta.hot` accesses away, so built decks are unaffected.

## The edit

In the deck entry (usually `main.tsx`), replace the plain render call:

```tsx
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Present ... />
  </StrictMode>,
);
```

with the boundary pattern:

```tsx
// Hot-module boundary: a slide edit re-runs this entry into the SAME React root,
// so the deck keeps its state (current slide, step) across dev-server hot
// reloads instead of jumping back to slide 1. `bun build` compiles the
// hot.data access to a plain createRoot and erases accept() in built decks.
const root = (import.meta.hot.data.root ??= createRoot(document.getElementById("root")!));
root.render(
  <StrictMode>
    <Present ... />
  </StrictMode>,
);
import.meta.hot.accept();
```

Keep the render arguments exactly as they were; only the root creation, the
trailing `import.meta.hot.accept()`, and the explanatory comment are new.

`liebstoeckel dev` applies this automatically when the entry still matches the
plain scaffolded shape. If the entry has custom wiring (its own
`import.meta.hot` handling, multiple roots, a wrapper around render), apply the
same idea by hand: persist the root in `import.meta.hot.data`, self-accept.

## Opting out

If the deck deliberately manages HMR its own way, suppress this migration with
a reason in the deck's `package.json`:

```json
"liebstoeckel": {
  "migrationOptOut": {
    "0001-hmr-entry-boundary": "custom HMR via our own dispose handler"
  }
}
```

The reason is mandatory. `doctor --json` keeps reporting the entry as
`suppressed: true` with the reason; hints and auto-patching stop.
