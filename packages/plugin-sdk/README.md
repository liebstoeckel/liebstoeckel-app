# @liebstoeckel/plugin-sdk

> Build real-time liebstoeckel plugins on Yjs-backed shared state.

Part of [liebstoeckel](https://liebstoeckel.app), a code-first presentation framework. You write decks in MDX and TSX and build them into a single self-contained HTML file with no server or runtime dependencies. The same file works offline, and when you host it the deck runs a live session between the presenter and the audience. Built on Bun, React 19, Motion, and Tailwind v4.

> **Status: experimental, pre-1.0.** liebstoeckel is an evolving experiment, not yet production-ready. Before 1.0, breaking changes can land in any release without a major-version bump, so pin an exact version if you depend on it.

This is the foundation for audience-interaction plugins, like polls, Q&A, reactions, and your own. It gives you a tiny runtime schema (`t` / `schema`), a [Yjs](https://yjs.dev)-backed state accessor (`pluginState`) that CRDT-syncs between the presenter and the audience, and `definePlugin` to declare a plugin's client pieces and an optional server piece.

## Install

```sh
bun add @liebstoeckel/plugin-sdk
```

Peer deps: `react`, `yjs`. Plugin UIs usually also use [`@liebstoeckel/plugin-ui`](https://www.npmjs.com/package/@liebstoeckel/plugin-ui).

## Usage

Model the shared state with a schema, then define the plugin:

```ts
// logic.ts: pure, no React
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

- `.` exports `definePlugin`, `pluginState`, `schema`, `t`, `Infer`, and the plugin, client, and server types
- `./schema` is the runtime schema system (`t.string|number|boolean|array|record|object`)
- `./state` exports `pluginState(doc, id, schema)`, with `snapshot`, `set`, `recordSet`/`recordDelete`, and `subscribe`
- `./manifest` serializes and embeds the plugin manifest and server bundles into built HTML
- `./discovery` finds plugins by the `liebstoeckel-plugin` keyword at build time

## How it fits together

The SDK is pure infrastructure. It does no React rendering and carries no network transport of its own. It defines the contract a plugin implements and the typed bridge over the deck's shared doc.

- The schema (`t` / `schema`) is runtime-typed with static inference. `Infer<S>` recovers the TypeScript shape, and each field carries `parse`, `safeParse`, and `default()`.
- `pluginState(doc, id, schema)` maps that state onto a `Y.Map` namespaced to `plugin:<id>`. Objects and records become nested `Y.Map`s so concurrent writes merge, which is how votes from many viewers don't clobber each other. Reads come back as plain JS. Use `recordSet`/`recordDelete` for a single entry of a `t.record` field, and a composite key (`` `${qid}|${pid}` ``) when the state has more than one dimension.
- `definePlugin` carries the client and server split. `client.Slide` renders for everyone, `client.Presenter` is an optional presenter-only panel, and `client.fallback` renders when no server is connected (a standalone `.html` and thumbnail capture). The optional `server(ctx)` runs on the host, never in the audience's browsers.

All plugins in a deck share one `Y.Doc`, and each plugin's state is namespaced to `plugin:<id>`.

## Links

- [Building a plugin](https://docs.liebstoeckel.app/plugins/building-a-plugin/)
- [State and sync](https://docs.liebstoeckel.app/plugins/state-and-sync/)
- [Homepage](https://liebstoeckel.app)
- [Source and issues](https://github.com/liebstoeckel/liebstoeckel-app)

Licensed under [MPL-2.0](https://github.com/liebstoeckel/liebstoeckel-app/blob/main/LICENSE).
