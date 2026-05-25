# Live server (`@present-it/live-server`)

Turns a deck into a **live, multi-device session** — `bunx`-runnable, additive (the deck still ships as a standalone `.html`). It serves the deck, relays a shared Yjs document over WebSocket, and runs any server-side plugin code. See the [state model](../../../docs/state-model.md) for how this fits together.

## Run it

```bash
bunx present-it <deck.html | deck-project-dir>
# or in this repo:
bun run poll:live
```

It prints a **presenter** link, a **read-only** link, and a QR for the read-only link.

## Targets

`classifyTargetPath` decides what you pointed at:

- **`.html`** → served as-is (its embedded manifest is read for server plugins).
- **project dir / `package.json`** → built first via `buildDeck`, then served.

## Sessions, tokens & roles

`createSession()` makes a session id + two unguessable tokens. The role is resolved from the URL `?t=<token>`:

- **presenter token** — privileged (drives nav, presenter-only plugin actions).
- **viewer token** — public (the QR); follows + may interact with plugin state.

`roleForToken` denies anything else (403). Tokens in the URL over plain HTTP is the accepted posture for LAN use (see `DESIGN.md` §11) — no rate-limit/sandbox; assume non-malicious clients.

## What the server does on a request

- **`GET /?t=…`** → resolve role; inject `window.__PRESENT_IT_LIVE__ = { ws, token, role, viewer }` into the deck HTML and return it. (Absent token → 403.)
- **`GET /sync?t=…`** → upgrade to WebSocket if the token is valid.

The injected bootstrap is how the client knows it's live (and gets the WS url, its role, and the read-only link for the in-deck QR).

## The Yjs relay (`Hub`)

One authoritative `Y.Doc` per session:

- on **join**, the newcomer gets the full state (`Y.encodeStateAsUpdate`) — late joiners catch up.
- each incoming update is applied and **broadcast to every other peer** (via `doc.on("update", origin)`; the sender isn't echoed). Server-plugin mutations broadcast to all.
- **resilience:** `Hub.recv` wraps `Y.applyUpdate` in try/catch and the WS handler drops oversized frames (4 MB cap), so a malformed/garbage frame can't crash the relay.

The doc holds the `deck` map (`index`/`step`/`total`) and each plugin's `plugin:<id>` map.

## Server plugins — manifest & rehydration

A plugin's **server** part runs here. Because a built `.html` can't carry executable Node code by reference, `buildDeck`:

1. discovers plugins from the deck's `package.json` deps (keyword `present-it-plugin` + a `presentIt` field),
2. bundles each server entry with `Bun.build` (`target:"bun"`, self-contained),
3. **base64-embeds** it in an inert `<script type="application/json" data-present-it-plugins>` manifest in the HTML.

On startup the server reads that manifest, decodes each bundle to a temp module, imports it, and calls its default export — a **`ctx`-receiving function** `({ doc, session }) => …`. Because the host injects `ctx`, the bundle externalizes nothing and needs no `node_modules` resolution. (Pure-JS server plugins only; native addons can't be embedded.)

## Networking

WebSocket transport; **LAN-first** — the server binds `0.0.0.0` and the printed links/QR use the machine's LAN IP. Architected so a future binary can front it with a **public reverse proxy / tunnel** without changing decks or plugins.

## Programmatic API

```ts
import { startServer } from "@present-it/live-server";
const live = await startServer({ html, port?, hostname?, publicHost? });
// → { session, hub, port, baseUrl, links, serverPlugins, stop() }
```

Plus the lower-level pieces are exported for reuse/testing: `Hub`, `createSession`/`roleForToken`/`buildLinks`, `injectBootstrap`, `embedManifest`/`extractManifest`/`rehydrateServerBundle`, `discoverFromPackageJson`, `classifyTargetPath`.

## Data flow

```
build:   deck deps → discover plugins → bundle server parts → base64 manifest in deck.html
serve:   GET /?t=…  → inject bootstrap → deck connects /sync (WS)
live:    presenter writes deck map / plugin maps → Hub relays → viewers follow + see results
```
