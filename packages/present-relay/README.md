# @liebstoeckel/present-relay

> WAN relay for liebstoeckel live mode — reach remote audiences without exposing your laptop.

Part of **[liebstoeckel](https://liebstoeckel.app)** — a code-first presentation framework: author decks in **MDX + TSX**, get one self-contained HTML file that's animated, interactive, and live-shareable. Built on **Bun + React 19 + Motion + Tailwind v4**.

> ⚠️ Pre-release (`0.0.0`). APIs may change.

A stateless bridge you run on a public host. The presenter connects out to it, remote viewers connect in, and frames pass through — so you can present to people off your LAN without opening ports on your machine. The relay **never runs deck code**: it serves the deck under a locked-down `sandbox` CSP (opaque origin) and only shuttles sync frames.

## Install

```sh
bun add @liebstoeckel/present-relay
# …or run the relay directly:
bunx @liebstoeckel/present-relay --tokens "<account-token>"
```

## Usage

```ts
import { createRelay } from "@liebstoeckel/present-relay";

const relay = await createRelay({
  accountTokens: ["s3cret-account-token"], // at least one, required
  publicBaseUrl: "https://relay.example.com", // for wss:// links behind TLS
});

console.log(relay.baseUrl);
// …later
await relay.stop();
```

Then point the live server at it (e.g. `liebstoeckel live deck.html --relay <url> --relay-token <token>`).

### Self-host with Docker

A generic image ships in this package ([`Dockerfile`](./Dockerfile)). It's all env-driven — `PORT`, `PRESENT_RELAY_TOKENS` (comma-separated account tokens), `PRESENT_RELAY_PUBLIC_URL` (your TLS origin, so links come back as `wss://`). Build from the **repo root** (a frozen workspace install resolves the `@liebstoeckel/*` symlinks):

```sh
docker build -f packages/present-relay/Dockerfile -t liebstoeckel-relay .
docker run -p 8080:8080 \
  -e PRESENT_RELAY_TOKENS="$(openssl rand -hex 24)" \
  -e PRESENT_RELAY_PUBLIC_URL=https://relay.example.com \
  liebstoeckel-relay
```

Terminate TLS at your proxy and forward `/sync/*` as a WebSocket. The image runs as a non-root user on `:8080` and is happy under a read-only root filesystem.

## Exports

| Entry | What |
|---|---|
| `@liebstoeckel/present-relay` | `createRelay`, the `RelayServer` runtime, auth helpers (`safeEqual`, `matchAccount`, `bearer`), and the `RelayOptions` type |
| `@liebstoeckel/present-relay/cli` | `runRelay` (powers the `liebstoeckel-relay` bin) — flags `--port`/`PORT`, `--tokens`/`PRESENT_RELAY_TOKENS`, `--public-url`/`PRESENT_RELAY_PUBLIC_URL` |

`createRelay` options: `accountTokens` (required, ≥1), `port?`, `hostname?` (`0.0.0.0`), `publicBaseUrl?`, `maxDeckBytes?` (8MB), `maxSessionsPerAccount?` (20), `sessionTtlMs?` (6h), `maxFrameBytes?` (4MB), `keepaliveMs?` (25s). Returns a `RelayServer` with `port`, `baseUrl`, `sessions`, and `stop()`.

## Gotchas

- Sessions are **in-memory and TTL-expiring** — the relay holds no deck content at rest and forgets sessions on restart.
- Terminate **TLS at your proxy** and pass `--public-url` so the relay hands out `wss://` links.
- Three token layers gate access: **account** (who may create sessions), **session**, and **runner**.

## Architecture

A single `Bun.serve` HTTP+WebSocket process holding many independent sessions in memory. It reuses `live-server`'s `Hub` / `Session` / token primitives — the relay adds the multi-tenant, public-facing shell around them.

- **`relay-server.ts`** — `createRelay`: the whole server. Routes:
  - `POST /api/sessions` (account-token `Bearer`-gated) — accepts an uploaded deck, enforces deck-size and per-account session quotas, mints a `Session` plus a privileged `runnerToken`, spins up a per-session `Hub`, and returns the presenter/viewer/sync URLs + an expiry.
  - `DELETE /api/sessions/:id` — owner-only teardown.
  - `WS /sync/:id?t=<token>` — token-gated Yjs relay into that session's `Hub`.
  - `GET /s/:id?t=<token>` — serves the deck under a locked-down **`sandbox allow-scripts allow-fullscreen`** CSP (opaque origin, no `allow-same-origin`) with `connect-src` pinned to the relay's own ws/http origin; the bootstrap is injected per request.
- **`auth.ts`** — constant-time token compare (`safeEqual` via `timingSafeEqual`), `matchAccount` (compares all configured tokens with no early-out), `bearer` header parse.
- Each session is **in-memory and TTL-expiring** (default 6h): a timer calls `dropSession` to destroy the `Hub` and forget tokens; nothing is persisted. `originOf` derives public URLs from `publicBaseUrl` or `x-forwarded-*` headers (TLS terminates at your proxy).
- **`cli.ts`** — `runRelay` powers the `liebstoeckel-relay` bin: parses `--port`/`--tokens`/`--public-url` (env fallbacks), generates a throwaway account token if none given, and prints the base URL + how to point `liebstoeckel live` at it.

## Docs

**[liebstoeckel.app/guides/relay](https://liebstoeckel.app/guides/relay/)** · [live mode](https://liebstoeckel.app/guides/live/)

## License

[MPL-2.0](https://github.com/limond/liebstoeckel-app-public/blob/main/LICENSE)
