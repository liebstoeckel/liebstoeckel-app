# Interactive plugins (poll, Q&A, reactions)

Plugins add live audience interaction to a deck. The same built `.html` works **offline**
(each plugin renders a read-only *fallback*) and **live** (state syncs over Yjs when the
deck is served with `liebstoeckel live`). You do not write a plugin to use one — the three
built-in plugins are packages you install, register, and place.

## The three built-ins

- `@liebstoeckel/plugin-poll` — live poll; everyone votes, bars update in real time.
- `@liebstoeckel/plugin-qa` — audience asks + upvotes questions from any slide; presenter moderates.
- `@liebstoeckel/plugin-reactions` — ephemeral floating emoji over the deck.

## Three steps to add one

1. **Install** the plugin package(s) into the deck:

   ```bash
   bun add @liebstoeckel/plugin-poll @liebstoeckel/plugin-qa @liebstoeckel/plugin-reactions
   ```

2. **Register** them on `<Present>` in `main.tsx`. The default export of each package is the
   plugin definition; pass the ones you use in `plugins={[…]}`:

   ```tsx title="main.tsx"
   import { Present } from "@liebstoeckel/engine";
   import poll from "@liebstoeckel/plugin-poll";
   import qa from "@liebstoeckel/plugin-qa";
   import reactions from "@liebstoeckel/plugin-reactions";

   <Present plugins={[poll, qa, reactions]} slides={[…]} />
   ```

3. **Place** a plugin on a slide with `<Plugin>` from the engine. `id` selects the plugin;
   `props` are the plugin's authoring options:

   ```tsx title="slides/02-poll.tsx"
   import { Plugin } from "@liebstoeckel/engine";

   <Plugin
     id="poll"
     props={{ question: "Ship it?", options: ["Yes", "Also yes"] }}
   />
   ```

   - **poll** props: `{ question: string; options: string[] }`
   - **qa** props: `{ prompt?: string }` (Q&A also works from any slide via a chrome button, no slide required)
   - **reactions** props: none — `<Plugin id="reactions" />`

## Critical: register what you place

The `id` in `<Plugin id="…">` **must** be present in `<Present plugins={[…]}>`. If you place a
plugin you didn't register, it renders **nothing** — the build still succeeds, so a blank spot
on a slide almost always means a missing registration. (Dev builds also log a console warning.)

## Offline vs live

- Open the built `.html` directly → each plugin shows its **offline preview** fallback (e.g. the
  poll question with disabled options and "Start the live server to vote").
- Serve it with `liebstoeckel live <deck>` → plugins go interactive and sync across the audience.

Validate as always with the `build --check` loop; see `references/troubleshooting.md`.
