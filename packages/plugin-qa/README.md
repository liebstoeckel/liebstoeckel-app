# @liebstoeckel/plugin-qa

> Live audience Q&A for liebstoeckel. Questions get asked, upvoted, and ranked in real time.

Part of [liebstoeckel](https://liebstoeckel.app), a code-first presentation framework. You write decks in MDX and TSX and build them into a single self-contained HTML file with no server or runtime dependencies. The same file works offline, and when you host it the deck runs a live session between the presenter and the audience. Built on Bun, React 19, Motion, and Tailwind v4.

> **Status: experimental, pre-1.0.** liebstoeckel is an evolving experiment, not yet production-ready. Before 1.0, breaking changes can land in any release without a major-version bump, so pin an exact version if you depend on it.

The audience submits questions from their own devices and upvotes the ones they want answered, and the queue re-ranks live (by votes, then submission time). The presenter moderates from the presenter console, marking a question answered or dismissing it. State syncs over the deck's shared [Yjs](https://yjs.dev) document.

## Install

```sh
bun add @liebstoeckel/plugin-qa
bun add react   # peer
```

## Usage

Register the plugin, and the audience can ask from any slide through a 💬 chrome button, with no Q&A slide required:

```tsx
// main.tsx
import qa from "@liebstoeckel/plugin-qa";

<Present plugins={[qa]} slides={[…]} />;
```

To give Q&A its own spotlight slide (the prompt plus the live ranked list), place it:

```tsx
import { Plugin } from "@liebstoeckel/engine";

<Plugin id="qa" props={{ prompt: "What should we dig into?" }} />;
```

Present the deck live (`liebstoeckel live …`) so the room can post and upvote.

## Exports

| Entry | What |
|---|---|
| `@liebstoeckel/plugin-qa` | Default export: the Q&A `PluginDef` (`id: "qa"`) |
| `@liebstoeckel/plugin-qa/logic` | Framework-free schema and helpers: `qaSchema`, `rankedQuestions`, `voteKey`, `voteCount`, `hasVoted`, and the `QaState` / `RankedQuestion` types |

## Links

- [Plugins overview](https://docs.liebstoeckel.app/plugins/overview/)
- [Live presenting](https://docs.liebstoeckel.app/guides/live/)
- [Homepage](https://liebstoeckel.app)
- [Source and issues](https://github.com/liebstoeckel/liebstoeckel-app)

Licensed under [MPL-2.0](https://github.com/liebstoeckel/liebstoeckel-app/blob/main/LICENSE).
