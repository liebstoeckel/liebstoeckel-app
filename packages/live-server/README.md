# @liebstoeckel/live-server

> Live presenter and audience sync for liebstoeckel. `Bun.serve` plus Yjs over WebSocket on your LAN.

Part of [liebstoeckel](https://liebstoeckel.app), a code-first presentation framework. You write decks in MDX and TSX and build them into a single self-contained HTML file with no server or runtime dependencies. The same file works offline, and when you host it the deck runs a live session between the presenter and the audience. Built on Bun, React 19, Motion, and Tailwind v4.

> Pre-release software. The API can still change.

It serves a built deck and keeps everyone in step over WebSockets. The presenter drives navigation, the audience follows, and interactive plugins (polls, Q&A, reactions) share state through a Yjs document. Roles are handed out as unguessable URL tokens, so you open the presenter link yourself and hand the audience link to the room. Most people drive it through `liebstoeckel live` in [@liebstoeckel/cli](https://www.npmjs.com/package/@liebstoeckel/cli). Use this package directly when you want to embed the server.

## Install

```sh
bun add @liebstoeckel/live-server
bun add yjs   # peer
```

> Bun-only, built on `Bun.serve`.

## Usage

```ts
import { startServer } from "@liebstoeckel/live-server";

const server = await startServer({ html: "dist/index.html" });

console.log(server.links.presenter); // open this yourself
console.log(server.links.viewer);    // share this with the room

// …later
await server.stop();
```

`startServer({ html, port?, hostname? = "0.0.0.0", publicHost? })` resolves to a `LiveServer` with `session`, `hub`, `port`, `baseUrl`, `links`, `serverPlugins`, and `stop()`. It serves `GET /?t=<token>` and a `WS /sync?t=<token>` endpoint.

## Exports

| Entry | What |
|---|---|
| `@liebstoeckel/live-server` | `startServer`, `lanAddress`, session helpers (`createSession`, `roleForToken`, `buildLinks`), the `Hub` / `Peer` runtime, `injectBootstrap`, deck loaders (`classifyTargetPath`, `loadDeckHtml`), the manifest/discovery and relay-client helpers, and the `ServeOptions` / `LiveServer` / `Session` / `Role` / `Links` types |
| `@liebstoeckel/live-server/cli` | `runLive` (powers `liebstoeckel live`) |

## Gotchas

- Roles are URL tokens, not logins. Anyone with the presenter link can drive the deck, so treat it like a secret.
- It runs server-plugin code on the host and binds `0.0.0.0` by default, so only serve decks you trust on a network you trust.
- To share beyond the LAN, pair it with [@liebstoeckel/present-relay](https://docs.liebstoeckel.app/guides/relay/).

## Architecture

A `Bun.serve` HTTP and WebSocket server in front of a single-session Yjs relay. One deck is one process.

- `server.ts` holds `startServer`. It extracts the embedded plugin manifest, then rehydrates and runs any server plugins on the host (a plugin's default export gets `{ doc, session }` and may return a teardown). It serves `GET /?t=<token>` (the deck HTML with the live bootstrap injected) and upgrades `WS /sync?t=<token>`. Inbound frames are capped at 4 MB, and Bun's auto-ping `idleTimeout` prunes dead sockets.
- `relay.ts` holds the `Hub`, which owns the authoritative `Y.Doc`. New peers get full state when they join (late-join replay), and each peer's update broadcasts to every other peer, keyed by origin. Periodic no-op keepalive frames feed the client liveness watchdogs and prune dead peers. A failing send drops that peer instead of throwing.
- `session.ts` mints two unguessable hex tokens per session. `roleForToken` maps a URL token to `presenter` or `viewer`, and denies anything unknown. `buildLinks` formats the shareable URLs.
- `inject.ts` writes `window.__LIEBSTOECKEL_LIVE__` into `<head>` (the WebSocket URL, role, token, and viewer link), so the engine's live client activates instead of its standalone fallback.
- `manifest.ts` and `discovery.ts` re-export `@liebstoeckel/plugin-sdk` (manifest extract and embed, plus server-bundle rehydrate), so the build and the live server share one implementation.
- `relay-client.ts` is the WAN path. `uploadDeck` and `endSession` call a `present-relay` control API, and `runServerPluginsViaRelay` runs the deck's server plugins locally while connecting to the relay as the privileged `runner` peer, so deck code never runs on the relay.
- `cli.ts` holds `runLive`, which powers `liebstoeckel live`. It classifies the target (a built `.html` or a project directory, building through `@liebstoeckel/engine` when needed), then runs in LAN mode (`startServer`) or relay mode (`relay-client`), printing the local and LAN presenter and audience links.

## Links

- [Live presenting](https://docs.liebstoeckel.app/guides/live/) and the [relay guide](https://docs.liebstoeckel.app/guides/relay/)
- [Homepage](https://liebstoeckel.app)
- [Source and issues](https://github.com/liebstoeckel/liebstoeckel-app)

Licensed under [MPL-2.0](https://github.com/liebstoeckel/liebstoeckel-app/blob/main/LICENSE).
