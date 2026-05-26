# present-relay

A public relay for liebstoeckel live sessions — it gives a session reach beyond the
LAN. The relay hosts the session's Yjs doc (transport only) and serves the deck;
**the deck's code never runs on the relay**. The local `liebstoeckel` runs the deck's
server plugins and connects as a privileged peer.

## Run

```bash
PRESENT_RELAY_TOKENS=tok1,tok2 bunx present-relay --port 8080 --public-url https://relay.example
# no tokens set → one is generated and printed for the run
```

Then point a deck at it:

```bash
bunx liebstoeckel ./deck.html --relay https://relay.example --relay-token tok1
# uploads the deck, runs its server plugins locally, prints public presenter/viewer links + QR
```

## API

| | |
|---|---|
| `POST /api/sessions` | `Authorization: Bearer <account-token>`, body = deck HTML → `{ id, presenterToken, viewerToken, runnerToken, urls }`. Enforces deck-size (413) and per-account session (429) quotas. |
| `DELETE /api/sessions/:id` | owner-only; ends the session. |
| `GET /s/:id?t=<token>` | serves the deck (bootstrap injected) for a presenter/viewer token; opaque-sandbox CSP. 403 otherwise. |
| `GET /sync/:id?t=<token>` | Yjs WebSocket; presenter/viewer/runner tokens. Frame-capped. |
| `GET /healthz` | liveness. |

## Security

- **Account auth** — pre-shared bearer tokens, compared constant-time (`safeEqual`,
  no early-out across the token set). v1 of "accounts"; OIDC later.
- **Untrusted-HTML isolation** — decks are served with
  `Content-Security-Policy: sandbox allow-scripts allow-fullscreen;` (no
  `allow-same-origin`). The deck runs scripts and opens the live WebSocket, but
  **`sessionStorage`/`document.cookie` are denied** — it can't reach the relay's
  cookies/storage/DOM, and each load is its own opaque origin (deck-to-deck
  isolation). No separate origin or wildcard cert.
- **CORS is a non-issue** — the WebSocket isn't CORS-gated; the opaque deck sends
  `Origin: null` and the relay accepts it (auth is the URL token, not cookies → no
  CSWSH). The deck is a single inlined file, so there are no cross-origin
  subresources.
- **Ephemeral** — docs live in memory only and are dropped on TTL/`DELETE` (privacy).
- **Quotas** — per-account session count, deck size, inbound WS frame size.

Terminate **TLS (wss://)** at a reverse proxy for public use and pass the https
origin via `--public-url`.

## Threat model (v1)

Clients are assumed non-malicious (XSS is still prevented by the sandbox). The relay
relays writes from any session token; **presenter-vs-viewer write authority is
enforced client-side** (viewers' nav writes are no-ops), as on the LAN server.
Server-side write-role enforcement is a later hardening step.
