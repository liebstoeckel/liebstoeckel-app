# @liebstoeckel/live-server

> Presenter↔audience live sync for liebstoeckel — `Bun.serve` + Yjs over WebSocket on your LAN.

Part of **[liebstoeckel](https://liebstoeckel.app)** — a code-first presentation framework: author decks in **MDX + TSX**, get one self-contained HTML file that's animated, interactive, and live-shareable. Built on **Bun + React 19 + Motion + Tailwind v4**.

> ⚠️ Pre-release (`0.0.0`). APIs may change.

Serves a built deck and keeps everyone in step over WebSockets: the presenter drives navigation, the audience follows, and interactive plugins (polls, Q&A, reactions) share state through a **Yjs** document. Roles are handed out as unguessable URL tokens — open the presenter link yourself, hand the audience link to the room. Usually driven via `liebstoeckel live` from **@liebstoeckel/cli**; use this package directly to embed the server.

## Install

```sh
bun add @liebstoeckel/live-server
bun add yjs   # peer
```

> Bun-only — built on `Bun.serve`.

## Usage

```ts
import { startServer } from "@liebstoeckel/live-server";

const server = await startServer({ html: "dist/index.html" });

console.log(server.links.presenter); // open this yourself
console.log(server.links.audience);  // share this with the room

// …later
await server.stop();
```

`startServer({ html, port?, hostname? = "0.0.0.0", publicHost? })` resolves to a `LiveServer` with `session`, `hub`, `port`, `baseUrl`, `links`, `serverPlugins`, and `stop()`. It serves `GET /?t=<token>` and a `WS /sync?t=<token>` endpoint.

## Exports

| Entry | What |
|---|---|
| `@liebstoeckel/live-server` | `startServer`, `lanAddress`, session helpers (`createSession`, `roleForToken`, `buildLinks`), the `Hub` / `Peer` runtime, `injectBootstrap`, deck loaders (`classifyTargetPath`, `loadDeckHtml`), manifest/discovery + relay-client helpers, and the `ServeOptions` / `LiveServer` / `Session` / `Role` / `Links` types |
| `@liebstoeckel/live-server/cli` | `runLive` (powers `liebstoeckel live`) |

## Gotchas

- **Roles are URL tokens, not logins.** Anyone with the presenter link can drive — treat it like a secret.
- It **runs server-plugin code on the host** and binds `0.0.0.0` by default, so only serve decks you trust on a network you trust.
- For sharing beyond the LAN, pair it with **[@liebstoeckel/present-relay](https://docs.liebstoeckel.app/guides/relay/)**.

## Architecture

A `Bun.serve` HTTP+WebSocket server fronting a single-session Yjs relay. One deck = one process.

- **`server.ts`** — `startServer`: extracts the embedded plugin manifest, rehydrates and runs any **server plugins on the host** (their default export gets `{ doc, session }` and may return a teardown), then serves `GET /?t=<token>` (deck HTML with the live bootstrap injected) and upgrades `WS /sync?t=<token>`. Caps inbound frames at 4 MB; relies on Bun's auto-ping `idleTimeout` to prune dead sockets.
- **`relay.ts`** — `Hub`: the authoritative `Y.Doc`. New peers get full state on join (late-join replay); each peer's update broadcasts to every *other* peer (origin-keyed). Periodic no-op keepalive frames drive client liveness watchdogs and prune dead peers; failing sends drop a peer instead of throwing.
- **`session.ts`** — two unguessable hex tokens per session; `roleForToken` maps a URL token to `presenter` | `viewer` (unknown → deny); `buildLinks` formats the shareable URLs.
- **`inject.ts`** — writes `window.__LIEBSTOECKEL_LIVE__` into `<head>` (ws url, role, token, viewer link) so the engine's live client activates instead of its standalone fallback.
- **`manifest.ts` / `discovery.ts`** — re-export `@liebstoeckel/plugin-sdk` (manifest extract/embed + server-bundle rehydrate) so build and live server share one impl.
- **`relay-client.ts`** — WAN path: `uploadDeck`/`endSession` hit a `present-relay`'s control API, and `runServerPluginsViaRelay` runs the deck's server plugins locally while connecting to the relay as the privileged `runner` peer (deck code never runs on the relay).
- **`cli.ts`** — `runLive` powers `liebstoeckel live`: classifies the target (`.html` vs project dir, building via `@liebstoeckel/engine` if needed), then LAN mode (`startServer`) or relay mode (`relay-client`), printing local + LAN presenter/audience links.

## Docs

**[liebstoeckel.app/guides/live](https://docs.liebstoeckel.app/guides/live/)** · [relay](https://docs.liebstoeckel.app/guides/relay/)

## License

[MPL-2.0](https://github.com/liebstoeckel/liebstoeckel-app/blob/main/LICENSE)
