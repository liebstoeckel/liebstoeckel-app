# @liebstoeckel/present-relay

> A WAN relay for liebstoeckel live mode. Reach remote audiences without exposing your laptop.

Part of [liebstoeckel](https://liebstoeckel.app), a code-first presentation framework. You write decks in MDX and TSX and build them into a single self-contained HTML file with no server or runtime dependencies. The same file works offline, and when you host it the deck runs a live session between the presenter and the audience. Built on Bun, React 19, Motion, and Tailwind v4.

> Pre-release software. The API can still change.

A stateless bridge you run on a public host. The presenter connects out to it, remote viewers connect in, and frames pass through, so you can present to people off your LAN without opening ports on your machine. The relay never runs deck code. It serves the deck under a locked-down `sandbox` CSP (an opaque origin) and only shuttles sync frames.

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

Then point the live server at it, for example `liebstoeckel live deck.html --relay <url> --relay-token <token>`.

### Self-host with Docker

A generic image ships in this package ([`Dockerfile`](./Dockerfile)). It's all env-driven: `PORT`, `PRESENT_RELAY_TOKENS` (comma-separated account tokens), and `PRESENT_RELAY_PUBLIC_URL` (your TLS origin, so links come back as `wss://`). Build it from the repo root, where a frozen workspace install resolves the `@liebstoeckel/*` symlinks:

```sh
docker build -f packages/present-relay/Dockerfile -t liebstoeckel-relay .
docker run -p 8080:8080 \
  -e PRESENT_RELAY_TOKENS="$(openssl rand -hex 24)" \
  -e PRESENT_RELAY_PUBLIC_URL=https://relay.example.com \
  liebstoeckel-relay
```

Terminate TLS at your proxy and forward `/sync/*` as a WebSocket. The image runs as a non-root user on `:8080` and works under a read-only root filesystem.

## Exports

| Entry | What |
|---|---|
| `@liebstoeckel/present-relay` | `createRelay`, the `RelayServer` runtime, auth helpers (`safeEqual`, `matchAccount`, `bearer`), and the `RelayOptions` type |
| `@liebstoeckel/present-relay/cli` | `runRelay` (powers the `liebstoeckel-relay` bin). Flags: `--port`/`PORT`, `--tokens`/`PRESENT_RELAY_TOKENS`, `--public-url`/`PRESENT_RELAY_PUBLIC_URL` |

`createRelay` options: `accountTokens` (required, at least one), `port?`, `hostname?` (`0.0.0.0`), `publicBaseUrl?`, `maxDeckBytes?` (8MB), `maxSessionsPerAccount?` (200), `sessionTtlMs?` (6h), `maxFrameBytes?` (4MB), `keepaliveMs?` (25s). It returns a `RelayServer` with `port`, `baseUrl`, `sessions`, and `stop()`.

## Gotchas

- Sessions are in-memory and TTL-expiring. The relay holds no deck content at rest and forgets sessions on restart.
- Terminate TLS at your proxy and pass `--public-url` so the relay hands out `wss://` links.
- Three token layers gate access: account (who may create sessions), session, and runner.

## Architecture

A single `Bun.serve` HTTP and WebSocket process that holds many independent sessions in memory. It reuses the `Hub`, `Session`, and token primitives from `live-server`, and adds the multi-tenant, public-facing shell around them.

- `relay-server.ts` holds `createRelay`, the whole server. Its routes:
  - `POST /api/sessions` (gated by an account-token `Bearer`) accepts an uploaded deck, enforces the deck-size and per-account session quotas, mints a `Session` plus a privileged `runnerToken`, spins up a per-session `Hub`, and returns the presenter, viewer, and sync URLs with an expiry.
  - `DELETE /api/sessions/:id` is owner-only teardown.
  - `WS /sync/:id?t=<token>` is a token-gated Yjs relay into that session's `Hub`.
  - `GET /s/:id?t=<token>` serves the deck under a locked-down `sandbox allow-scripts allow-popups` CSP (an opaque origin, no `allow-same-origin`; `allow-popups` is only for the presenter `P` pop-out), with `connect-src` pinned to the relay's own ws and http origin. The bootstrap is injected per request.
- `auth.ts` does constant-time token comparison (`safeEqual` over `timingSafeEqual`), `matchAccount` (which compares all configured tokens with no early-out), and `bearer` header parsing.
- Each session is in-memory and TTL-expiring (6h by default). A timer calls `dropSession` to destroy the `Hub` and forget its tokens, and nothing is persisted. `originOf` derives public URLs from `publicBaseUrl` or the `x-forwarded-*` headers, since TLS terminates at your proxy.
- `cli.ts` holds `runRelay`, which powers the `liebstoeckel-relay` bin. It parses `--port`, `--tokens`, and `--public-url` (with env fallbacks), generates a throwaway account token when none is given, and prints the base URL along with how to point `liebstoeckel live` at it.

## Links

- [Relay guide](https://docs.liebstoeckel.app/guides/relay/) and [live mode](https://docs.liebstoeckel.app/guides/live/)
- [Homepage](https://liebstoeckel.app)
- [Source and issues](https://github.com/liebstoeckel/liebstoeckel-app)

Licensed under [MPL-2.0](https://github.com/liebstoeckel/liebstoeckel-app/blob/main/LICENSE).
