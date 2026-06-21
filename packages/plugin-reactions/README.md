# @liebstoeckel/plugin-reactions

> Floating emoji reactions for liebstoeckel decks.

Part of [liebstoeckel](https://liebstoeckel.app), a code-first presentation framework. You write decks in MDX and TSX and build them into a single self-contained HTML file with no server or runtime dependencies. The same file works offline, and when you host it the deck runs a live session between the presenter and the audience. Built on Bun, React 19, Motion, and Tailwind v4.

> **Status: experimental, pre-1.0.** liebstoeckel is an evolving experiment, not yet production-ready. Before 1.0, breaking changes can land in any release without a major-version bump, so pin an exact version if you depend on it.

The audience taps an emoji (👏 ❤️ 🎉 🔥 😮 💡) and it floats up, drifts, and fades over the deck. It's a light ambient backchannel. Taps are rate-limited per viewer, and the live set is capped and auto-pruned, so the shared state stays bounded. It syncs over the deck's [Yjs](https://yjs.dev) document.

## Install

```sh
bun add @liebstoeckel/plugin-reactions
bun add react   # peer
```

## Usage

```tsx
// main.tsx
import reactions from "@liebstoeckel/plugin-reactions";

<Present plugins={[reactions]} slides={[…]} />;
```

```tsx
import { Plugin } from "@liebstoeckel/engine";

<Plugin id="reactions" />;
```

Reactions are symmetric, so there's no presenter-only panel. Present the deck live (`liebstoeckel live …`) so taps reach everyone.

## Exports

| Entry | What |
|---|---|
| `@liebstoeckel/plugin-reactions` | Default export: the reactions `PluginDef` (`id: "reactions"`) |
| `@liebstoeckel/plugin-reactions/logic` | Framework-free schema and helpers: `reactionsSchema`, `EMOJI`, `MAX_ENTRIES`, `recent`, `expired`, `allowEmit`, `overCapIds`, and the `ReactionsState` / `Reaction` types |

## Links

- [Plugins overview](https://docs.liebstoeckel.app/plugins/overview/)
- [Live presenting](https://docs.liebstoeckel.app/guides/live/)
- [Homepage](https://liebstoeckel.app)
- [Source and issues](https://github.com/liebstoeckel/liebstoeckel-app)

Licensed under [MPL-2.0](https://github.com/liebstoeckel/liebstoeckel-app/blob/main/LICENSE).
