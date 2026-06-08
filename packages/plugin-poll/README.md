# @liebstoeckel/plugin-poll

> Live polling for liebstoeckel — audience votes sync over CRDT, results animate in real time.

Part of **[liebstoeckel](https://liebstoeckel.app)** — a code-first presentation framework: author decks in **MDX + TSX**, get one self-contained HTML file that's animated, interactive, and live-shareable. Built on **Bun + React 19 + Motion + Tailwind v4**.

> ⚠️ Pre-release (`0.0.0`). APIs may change.

Drop a poll onto a slide, share the live link, and watch the bars fill as your audience votes. State lives entirely in the shared **Yjs** document — there's no poll server to run, and the slide still renders (with a fallback) offline and in thumbnails.

## Install

```sh
bun add @liebstoeckel/plugin-poll
bun add react   # peer
```

## Usage

```tsx
import { Present, Plugin } from "@liebstoeckel/engine";
import poll from "@liebstoeckel/plugin-poll";

<Present plugins={[poll]}>
  <Slide>
    <Plugin
      id="poll"
      props={{
        question: "Which stack?",
        options: ["Bun", "Node", "Deno"],
      }}
    />
  </Slide>
</Present>;
```

## Exports

| Entry | What |
|---|---|
| `@liebstoeckel/plugin-poll` | Default export: the poll `PluginDef` (`id: "poll"`). Also re-exports `pollSchema`, `tally`, `totalVotes`, `myVote`, `leader`, and the `PollState` / `TallyRow` types |
| `@liebstoeckel/plugin-poll/logic` | The pure tally/vote logic (framework-free, easy to unit-test) |

Surfaces: Slide, Presenter, an offline fallback, and a `Results` breakout surface.

## Gotchas

- The plugin id is fixed to **`"poll"`** — reference it as `<Plugin id="poll" …>`.
- Pure-CRDT: no backend. The fallback surface is what renders offline and in build-time thumbnails.

## Architecture

A pure-CRDT plugin: there is no `server` part — all behavior is client-side over the shared doc.

- **`logic.ts`** — framework-free schema + derivations. `pollSchema = schema({ question: t.string, options: t.array(t.string), votes: t.record(t.string), closed: t.boolean })`; `votes` maps `participantId → chosen option`. Pure helpers `tally` (per-option counts + percentages), `totalVotes`, `myVote(state, pid)`, and `leader` (winner, or `null` on a tie). Easy to unit-test.
- **`client.tsx`** — `definePlugin<PollState>({ id: "poll", state: pollSchema, client: {...} })`. `PollSlide` (the `Slide`) lets viewers and presenter vote via `state.recordSet("votes", participantId, option)` — concurrency-safe because `votes` is a record-backed `Y.Map` — and renders live `Bar` results underneath; the presenter also gets a close/reopen toggle (`state.set("closed", …)`). A `useSeed` effect has the presenter seed `question`/`options` from author `props` once via `ensureDefaults`. `PollPresenter` is a large presenter-only results panel. The `Results` view is a declared override **surface** (`surfaces: ["Results"]`), swappable through `ClientProps.ui`.
- **Standalone vs live:** when a server is connected, votes sync between presenter and audience in real time. With no server (standalone `.html` + build-time thumbnail), the `fallback` renders a static, disabled preview, preferring the author's `props.question`/`options`, then any seeded snapshot, then a generic placeholder.
- Builds on **plugin-sdk** (`definePlugin`, `schema`/`t`, `PluginState`, `ClientProps`) and **plugin-ui** (`Card`, `Button`, `Bar`, `Stack`, `Eyebrow`; bar colors come from the brand `theme.viz` palette).

## Docs

**[liebstoeckel.app/plugins/overview](https://docs.liebstoeckel.app/plugins/overview/)** · [live mode](https://docs.liebstoeckel.app/guides/live/)

## License

[MPL-2.0](https://github.com/limond/liebstoeckel-app-public/blob/main/LICENSE)
