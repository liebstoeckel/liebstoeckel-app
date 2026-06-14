# @liebstoeckel/plugin-poll

> Live polling for liebstoeckel. The audience votes, and results animate in real time.

Part of [liebstoeckel](https://liebstoeckel.app), a code-first presentation framework. You write decks in MDX and TSX and build them into a single self-contained HTML file with no server or runtime dependencies. The same file works offline, and when you host it the deck runs a live session between the presenter and the audience. Built on Bun, React 19, Motion, and Tailwind v4.

> Pre-release software. The API can still change.

Drop a poll onto a slide, share the live link, and watch the bars fill as the room votes. There's no poll server to run, since the state lives entirely in the deck's shared [Yjs](https://yjs.dev) document. The slide still renders offline and in thumbnails through a static fallback.

## Install

```sh
bun add @liebstoeckel/plugin-poll
bun add react   # peer
```

## Usage

Register the plugin with `<Present>`, then place it on a slide:

```tsx
// main.tsx
import poll from "@liebstoeckel/plugin-poll";

<Present plugins={[poll]} slides={[…]} />;
```

```tsx
// a slide
import { Plugin } from "@liebstoeckel/engine";

<Plugin id="poll" props={{ question: "Which stack?", options: ["Bun", "Node", "Deno"] }} />;
```

The id is fixed to `"poll"`. Present the deck live (`liebstoeckel live …`) so the audience can vote.

## Exports

| Entry | What |
|---|---|
| `@liebstoeckel/plugin-poll` | Default export: the poll `PluginDef`. It also re-exports `pollSchema`, `tally`, `totalVotes`, `myVote`, `leader`, and the `PollState` / `TallyRow` types |
| `@liebstoeckel/plugin-poll/logic` | The framework-free tally and vote logic, easy to unit-test |

## Links

- [Plugins overview](https://docs.liebstoeckel.app/plugins/overview/)
- [Live presenting](https://docs.liebstoeckel.app/guides/live/)
- [Homepage](https://liebstoeckel.app)
- [Source and issues](https://github.com/liebstoeckel/liebstoeckel-app)

Licensed under [MPL-2.0](https://github.com/liebstoeckel/liebstoeckel-app/blob/main/LICENSE).
