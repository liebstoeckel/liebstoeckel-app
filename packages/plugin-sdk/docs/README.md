# Plugins (`@liebstoeckel/plugin-sdk`)

A plugin adds **live, shared-state** interaction to a deck — a poll, reactions, a shared whiteboard. Each plugin is a Bun package with a **required client** part and an **optional server** part, and shares typed state over Yjs (see the [state model](../../../docs/state-model.md)).

## Anatomy

```tsx
import { definePlugin, schema, t, type ClientProps } from "@liebstoeckel/plugin-sdk";
import { Card, Button, useTheme } from "@liebstoeckel/plugin-ui";

type Poll = { question: string; options: string[]; votes: Record<string, string> };

export default definePlugin<Poll>({
  id: "poll",
  // typed shape of this plugin's slice of the shared Yjs doc
  state: schema({ question: t.string, options: t.array(t.string), votes: t.record(t.string) }),

  // OPTIONAL: a ctx-receiving fn that runs on the server (see "When you need a server part")
  server: ({ doc, session }) => { /* … */ },

  client: {
    Slide:     (p: ClientProps<Poll>) => <PollUI {...p} />,   // rendered in the deck
    Presenter: (p) => <PollResults {...p} />,                 // optional presenter-only panel
    fallback:  ({ snapshot }) => <PollOffline state={snapshot} />, // no server → static
    surfaces:  ["Results"],                                   // names an author may override
  },
});
```

Place it in a slide and pass per-instance config via `props`:

```tsx
import { Plugin } from "@liebstoeckel/engine";
<Plugin id="poll" props={{ question: "Next?", options: ["A", "B"] }} />
```

## Shared state

State is the plugin's slice of the session's Yjs doc, accessed through a typed handle (`@liebstoeckel/plugin-sdk/state`). Client components receive a ready-made one as `state` plus a live `snapshot`:

```tsx
function PollUI({ snapshot, state, participantId, role }: ClientProps<Poll>) {
  const vote = (opt: string) => state.recordSet("votes", participantId, opt); // one vote per participant
  // snapshot re-renders on every change (yours or anyone else's)
}
```

`PluginState<T>` methods:
- `snapshot(): T` — current value (plain JS), missing fields filled from schema defaults.
- `ensureDefaults(initial?)` — seed once if empty (the presenter typically seeds options).
- `set(key, value)` — replace a top-level field.
- `recordSet(field, key, value)` / `recordDelete(field, key)` — concurrency-friendly per-entry writes (votes keyed by participant → merges across clients).
- `subscribe(cb)` — observe deep changes.

Authority is **cooperative**, not enforced by the transport: any participant (including read-only viewers) can write. Gate presenter-only actions on `role` in your own code (e.g. only render a "close voting" button when `role === "presenter"`).

## The `schema` / `t` helpers

Runtime-validated, statically-inferred state types:

```ts
schema({ a: t.string, b: t.number, c: t.boolean, d: t.array(t.string), e: t.record(t.number) });
```

`schema(shape)` is sugar for `t.object(shape)`; each schema has `.parse` / `.safeParse` / `.default`. The inferred type flows into `ClientProps<T>`, `pluginState`, etc.

## `ClientProps<T>`

Every client component gets:

| prop | meaning |
|---|---|
| `snapshot: T` | current state, re-rendered on change |
| `state: PluginState<T>` | typed accessor for writes/subscribe |
| `role` | `"presenter" | "viewer"` |
| `live` | is a server connected? |
| `participantId` | stable id for this browser session |
| `theme` | resolved brand tokens (`ThemeTokens`) — for canvas/SVG |
| `ui` | author surface overrides (merged over your defaults) |
| `props` | author config passed at `<Plugin props={…}>` |

## When you need a server part

Most plugins are **client-only** — the server just relays the CRDT. Add a `server(ctx)` when you need authoritative or privileged logic: secrets, external API calls, server-side aggregation, or seeding that must happen before any client connects. It is a **function** receiving `{ doc, session }` (the live server injects them), so its bundle is self-contained — see [how it's packaged](#packaging) and [`live-server/docs`](../../live-server/docs/README.md).

## Theming & overrides

Plugin UI inherits the active brand for free — render with `@liebstoeckel/plugin-ui` primitives (`Card`, `Button`, `Bar`) or `var(--brand-*)`, and use `useTheme()` for token *values* (charts). Authors re-skin per slide without forking:

```tsx
<Plugin id="poll" components={{ Results: MyResults }} />
```

Inside the plugin, prefer an overridable surface: `const Results = (ui.Results as typeof Default) ?? Default;`.

## The standalone fallback

When no server is connected (`live === false`), `<Plugin>` renders your `fallback` instead of `Slide`. The same `.html` therefore works offline (a static preview) and lights up live. Always provide one.

## <a id="packaging"></a>Packaging & discovery

Mark the package so the tooling finds it:

```jsonc
// package.json
{
  "keywords": ["liebstoeckel-plugin"],
  "liebstoeckel": { "client": "./src/client.tsx", "server": "./src/server.ts" } // server optional
}
```

At build, `buildDeck` discovers plugins from the deck's dependencies, bundles each **server** entry (`Bun.build` `target:"bun"`) and **base64-embeds** it in the deck's HTML manifest. The live server rehydrates those bundles and calls `server(ctx)`. Client code is bundled into the deck normally.
