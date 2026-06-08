# @liebstoeckel/plugin-sdk

> Build real-time liebstoeckel plugins on Yjs-backed shared state.

The foundation for audience-interaction plugins (polls, Q&A, reactions, …). Provides a tiny runtime
schema (`t` / `schema`), a [Yjs](https://yjs.dev)-backed state accessor (`pluginState`) that
CRDT-syncs between presenter and audience, and `definePlugin` to declare a plugin's client (and
optional server) pieces.

Part of **[liebstoeckel](https://liebstoeckel.app)** — a code-first framework for animated,
single-file HTML presentations (Bun · React 19 · Motion · Tailwind v4 · MDX). Requires
[Bun](https://bun.sh); ships as raw TypeScript.

## Install

```sh
bun add @liebstoeckel/plugin-sdk
```

Peer deps: `react`, `yjs`. Plugin UIs typically also use [`@liebstoeckel/plugin-ui`](https://www.npmjs.com/package/@liebstoeckel/plugin-ui).

## Usage

Model shared state with a schema, then define the plugin:

```ts
// logic.ts — pure, no React
import { schema, t, type Infer } from "@liebstoeckel/plugin-sdk";

export const counterSchema = schema({
  label: t.string,
  clicks: t.record(t.number), // participantId -> count
});
export type CounterState = Infer<typeof counterSchema>;
```

```tsx
// index.tsx
import { definePlugin, type ClientProps } from "@liebstoeckel/plugin-sdk";
import { counterSchema, type CounterState } from "./logic";

function Slide({ state, snapshot, participantId }: ClientProps<CounterState>) {
  const mine = snapshot.clicks[participantId] ?? 0;
  return <button onClick={() => state.recordSet("clicks", participantId, mine + 1)}>{mine}</button>;
}

export default definePlugin({ id: "counter", state: counterSchema, client: { Slide } });
```

Authors mount it in a deck with `<Plugin id="counter" />` (from `@liebstoeckel/engine`).

## Exports

- `.` — `definePlugin`, `pluginState`, `schema`, `t`, `Infer`, plugin/client/server types
- `./schema` — the runtime schema system (`t.string|number|boolean|array|record|object`)
- `./state` — `pluginState(doc, id, schema)`: `snapshot`, `set`, `recordSet`/`recordDelete`, `subscribe`
- `./manifest` — serialize/embed the plugin manifest + server bundles into built HTML
- `./discovery` — find plugins by the `liebstoeckel-plugin` keyword (build-time)

## Notes

- All plugins in a deck share one `Y.Doc`; each plugin's state is namespaced to `plugin:<id>`.
- `recordSet`/`recordDelete` operate on top-level `t.record(...)` fields — use composite keys
  (`` `${qid}|${pid}` ``) for multi-dimension state.

## Architecture

The SDK is pure infrastructure — no React rendering, no Yjs network transport. It defines the contract a plugin implements and the typed bridge over the shared doc.

- **`schema.ts`** — a tiny runtime-typed schema. Primitives (`t.string|number|boolean`) are `Schema` instances; `t.array`/`t.record`/`t.object` are factories. Each `Schema<T>` carries `parse`/`safeParse`/`default()` plus a phantom `_t` for `Infer<S>` static inference. `schema(...)` is sugar for `t.object(...)`.
- **`state.ts`** — `pluginState(doc, id, schema)` maps the typed state onto a `Y.Map` at `plugin:<id>`. Objects/records become nested `Y.Map`s (concurrent writes merge — e.g. votes), arrays become `Y.Array`s; reads come back as plain JS via `toJS`, with missing fields filled from `schema.default()`. The `PluginState<T>` accessor exposes `snapshot()`, `ensureDefaults()` (seed only if empty), `set()`, `recordSet`/`recordDelete` (one entry of a `t.record` field, concurrency-friendly), and `subscribe()` (deep observe).
- **`plugin.ts`** — `definePlugin<T>(def)` is an identity helper carrying types. `PluginDef` = `{ id, state: Schema<T>, server?, client }`. The **client/server split**: `client.Slide` renders in the deck for everyone; `client.Presenter` is an optional presenter-only panel; `client.fallback` renders when no server is connected (standalone `.html` + thumbnail capture), receiving just `{ snapshot, props }`; `client.surfaces` names author-overridable surfaces; `client.interactive` gates the touch breakout. The optional `server(ctx)` runs relay-side with `{ doc, state, session }` and may return a teardown. Client components receive `ClientProps<T>` — `doc`, `state`, `snapshot`, `role` (`presenter`|`viewer`), `live`, `participantId`, resolved `theme` tokens, author `ui` overrides, and `props`.
- **`theme.ts`** — `ThemeTokens`, the resolved brand colors/fonts handed to clients (for canvas/SVG); read at runtime by plugin-ui's `useTheme()`.
- **`manifest.ts`** — build/runtime glue: encode/embed a `PluginManifest` (per-plugin name/version/`hasServer` + base64 server bundle) as an inert JSON `<script>` in built HTML, extract it, and `rehydrateServerBundle` (decode base64 → temp ESM → import) on the relay.
- **`discovery.ts`** — pure classification of deck dependencies as plugins via the `liebstoeckel-plugin` keyword + a `liebstoeckel` package.json field, with a Bun-resolving `fsLookup`.

## Docs

- Building a plugin — https://docs.liebstoeckel.app/plugins/building-a-plugin/
- State & sync — https://docs.liebstoeckel.app/plugins/state-and-sync/

MPL-2.0
