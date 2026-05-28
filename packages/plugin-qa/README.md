# @liebstoeckel/plugin-qa

> Live audience Q&A queue for liebstoeckel decks.

Viewers submit questions from their devices, everyone upvotes to surface the best ones, and the queue
re-ranks live (by votes, then submission time). The presenter can mark a question answered or dismiss
it. State syncs in real time over the deck's [Yjs](https://yjs.dev) session.

Part of **[liebstoeckel](https://liebstoeckel.app)** — a code-first framework for animated,
single-file HTML presentations (Bun · React 19 · Motion · Tailwind v4 · MDX). Requires
[Bun](https://bun.sh); ships as raw TypeScript.

## Install

```sh
bun add @liebstoeckel/plugin-qa
```

Peer dep: `react`. (Pulls in `@liebstoeckel/plugin-sdk`, `@liebstoeckel/plugin-ui`, and `motion`.)

## Usage

```tsx
import { Plugin } from "@liebstoeckel/engine";

export default () => <Plugin id="qa" props={{ prompt: "What should we dig into?" }} />;
```

Run the deck live (`liebstoeckel live …`) so the audience can post and upvote. Rows animate as the
queue re-ranks ([Motion](https://motion.dev) layout transitions).

## Exports

- `.` — the Q&A plugin (default export, `id: "qa"`)
- `./logic` — pure helpers + schema: `qaSchema`, `rankedQuestions`, `voteKey`, `voteCount`, `hasVoted`, types `QaState` / `RankedQuestion`

## Architecture

A pure-CRDT plugin (no `server` part); the ranked queue is derived client-side from shared state.

- **`logic.ts`** — framework-free schema + derivations. `qaSchema = schema({ questions: t.record(t.object({ text, author, ts })), votes: t.record(t.boolean), answered: t.record(t.boolean), dismissed: t.record(t.boolean) })`. Questions are keyed by a generated id; votes use a **composite key** `` `${qid}|${pid}` `` (via `voteKey`) so per-question, per-participant upvotes merge through the one-level record API. `voteCount` counts truthy votes by qid prefix, `hasVoted` checks one, and `rankedQuestions` produces the visible queue — dismissed excluded, sorted by votes desc then `ts` asc.
- **`client.tsx`** — `definePlugin<QaState>({ id: "qa", state: qaSchema, client: {...} })`. `QaSlide` (the `Slide`) has a submit box that writes a new question via `state.recordSet("questions", crypto.randomUUID(), {...})`, plus a live ranked list; upvoting toggles `recordSet`/`recordDelete` on `votes`. The presenter sees per-row controls to mark `answered` or `dismissed`. Rows animate on re-rank via Motion `layout`/`layoutId` inside `AnimatePresence`. `QaPresenter` is a compact presenter-only queue panel.
- **Standalone vs live:** with a server connected, audience submissions and upvotes sync in real time. Offline (standalone `.html` + thumbnail), the `fallback` shows the author's `props.prompt` plus a couple of example questions so the preview looks real.
- Builds on **plugin-sdk** (`definePlugin`, `schema`/`t`, `ClientProps`, record state API) and **plugin-ui** (`Card`, `Button`, `Eyebrow`, `Stack`); other rows are styled inline against `--brand-*` variables.

## Docs

- Plugins overview — https://liebstoeckel.app/plugins/overview/
- Live presenting — https://liebstoeckel.app/guides/live/

MPL-2.0
