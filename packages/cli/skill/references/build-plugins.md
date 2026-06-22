# Building a custom plugin

Reach for this only when none of the built-ins (`poll`, `qa`, `reactions` — see
`references/plugins.md`) fits. A custom plugin is a `definePlugin({ … })` value placed
and registered exactly like a built-in; the three built-ins are good templates to copy.

## Anatomy

```tsx
import { definePlugin, schema, t, type Infer, type ClientProps } from "@liebstoeckel/plugin-sdk";

const mySchema = schema({
  votes: t.record(t.string),   // participantId -> choice
  closed: t.boolean,
});
type MyState = Infer<typeof mySchema>;

export default definePlugin<MyState>({
  id: "myplugin",              // what authors write as <Plugin id="myplugin" />
  state: mySchema,             // the typed, synced CRDT state
  client: {
    Slide: MySlide,            // interactive UI (live)
    fallback: MyFallback,      // static preview (offline + thumbnails)
  },
});
```

`definePlugin<T>({ id, state, server?, client })` — `id` names the plugin (and
namespaces its state at `plugin:<id>`); the rest are below.

## State schema (`state`)

Build it with `schema({...})` and the `t` primitives:

- `t.string`, `t.number`, `t.boolean`
- `t.array(item)`
- `t.object({ … })`
- `t.record(value)` — a string-keyed map

**Concurrency rule:** anything many participants write at once must be a **top-level
`t.record`**, keyed by a composite string — there is no nested-record setter. For
example, store votes as a top-level `votes: t.record(t.string)` keyed by `participantId`
(or `"${questionId}|${participantId}"`), not as a nested object.

### Reading & writing state

The client and server receive a typed `state` accessor:

```ts
state.snapshot();                       // current value as plain JS (defaults filled in)
state.set("closed", true);              // replace a whole top-level field
state.recordSet("votes", pid, "Yes");   // set one entry of a top-level record field
state.recordDelete("votes", pid);       // remove one entry
state.ensureDefaults({ … });            // seed defaults once, only if state is empty
const off = state.subscribe((snap) => …);   // observe deep changes; returns unsubscribe
```

## Client surfaces (`client`)

`ClientProps<T>` is passed to every client component:
`{ doc, state, snapshot, role, live, participantId, theme, ui, props, instance }`
(`role` is `"presenter" | "viewer"`; `props` is the author's `<Plugin props={…}>`).

| field          | renders when / what                                                      |
|----------------|--------------------------------------------------------------------------|
| `Slide`        | live: the interactive in-deck UI (audience + presenter)                  |
| `fallback?`    | offline `.html` + thumbnails — show real content from `snapshot`/`props` |
| `presenter?`   | a tab in the presenter view: `{ label, icon?, badge?, title?, Console }` for live readout + privileged moderation |
| `global?`      | deck-wide surfaces: an `Overlay`, plus a chrome control (`icon`+`label`) toggling a `Panel`. `pinned` keeps it in the mobile rail; `panelMode: "sheet"` opens full-viewport on touch |
| `surfaces?`    | named override points an author may replace per placement (`<Plugin components={{ … }}>`) |
| `interactive?` | `false` to suppress the mobile tap-to-interact breakout (display-only)   |

### Canvas constraint

A slide renders on a fixed **1280×720 canvas** that is scaled to fit and **clipped**
(`overflow: hidden`) — it never scrolls, so the audience, presenter, and thumbnail views
stay pixel-identical. **Pin your header/input and scroll the growing part yourself**
using `ScrollArea` from `@liebstoeckel/plugin-ui`.

## UI kit — `@liebstoeckel/plugin-ui`

Brand-token-aware primitives so plugin UI matches the active theme automatically:

`Card`, `Button`, `Bar` (result bar), `Stack`, `ScrollArea`, `Eyebrow`, `ChromeButton`,
plus `useTheme()` / `readTheme()` for the resolved tokens. Prefer these over raw markup.

## Optional server part (`server`)

Only if the plugin needs host-side logic the audience's browsers can't do (compute an
official result, reach a secret/external HTTP). It runs **once**, on the machine running
`liebstoeckel live` — never in audience browsers, never on the relay.

```ts
import type { PluginServerCtx } from "@liebstoeckel/plugin-sdk";
import { pluginState } from "@liebstoeckel/plugin-sdk";

export default function server(ctx: PluginServerCtx<MyState>) {
  const state = pluginState(ctx.doc, "myplugin", mySchema);
  const stop = state.subscribe((snap) => {
    // host-only work; write results back to shared state
  });
  return () => stop();   // optional teardown
}
```

`PluginServerCtx<T>` = `{ doc, state, session: { id }, instance }`. At build time the
server entry is bundled and embedded in the deck; a live server decodes and runs it with
an injected `ctx`. Because it executes on the presenter's machine, decks are trust-gated
(`references/plugins.md`).

## After authoring

Register and place it like any built-in (see `references/plugins.md`), then run the
`liebstoeckel build --check` loop until clean.

Full guide with worked examples: https://docs.liebstoeckel.app/llms.txt
