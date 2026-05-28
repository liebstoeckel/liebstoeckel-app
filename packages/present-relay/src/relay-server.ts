import {
  Hub,
  createSession,
  roleForToken,
  injectBootstrap,
  type Peer,
  type Role,
  type Session,
} from "@liebstoeckel/live-server";
import { bearer, matchAccount, safeEqual } from "./auth";

export interface RelayOptions {
  /** pre-shared account API tokens; a POST must present one as `Bearer` */
  accountTokens: readonly string[];
  port?: number;
  hostname?: string;
  /** public base URL for the links we hand back (e.g. https://relay.example).
   *  Omitted → derived from the request (honors x-forwarded-proto/host). */
  publicBaseUrl?: string;
  /** max uploaded deck size (bytes) */
  maxDeckBytes?: number;
  /** max concurrent sessions per account */
  maxSessionsPerAccount?: number;
  /** session lifetime; the doc + tokens are dropped after this */
  sessionTtlMs?: number;
  /** inbound WS frame cap */
  maxFrameBytes?: number;
  /** keepalive period for each session Hub */
  keepaliveMs?: number;
}

interface RelaySession {
  id: string;
  account: string;
  hub: Hub;
  /** the built deck HTML (no bootstrap yet — injected per request) */
  html: string;
  session: Session;
  /** privileged peer token: the local deck-runner that applies server-plugin effects */
  runnerToken: string;
  createdAt: number;
  ttl?: ReturnType<typeof setTimeout>;
}

export interface RelayServer {
  port: number;
  baseUrl: string;
  sessions: Map<string, RelaySession>;
  stop(): void;
}

type WSData = { sessionId: string; peer: Peer | null };

const hex = (bytes = 16): string => {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
};

const DEFAULTS = {
  maxDeckBytes: 8 * 1024 * 1024,
  maxSessionsPerAccount: 20,
  sessionTtlMs: 6 * 60 * 60 * 1000,
  maxFrameBytes: 4 * 1024 * 1024,
  keepaliveMs: 25_000,
};

/** Resolve the public http/ws origins for the links we return. */
function originOf(req: Request, opts: RelayOptions): { http: string; ws: string } {
  if (opts.publicBaseUrl) {
    const b = opts.publicBaseUrl.replace(/\/$/, "");
    return { http: b, ws: b.replace(/^http/i, "ws") };
  }
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? (url.protocol === "https:" ? "https" : "http");
  const host = req.headers.get("x-forwarded-host") ?? url.host;
  return { http: `${proto}://${host}`, ws: `${proto === "https" ? "wss" : "ws"}://${host}` };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Resolve a session's role for a token: presenter/viewer (public) or runner
 *  (the privileged deck-runner peer). null = deny. */
function relayRole(s: RelaySession, token: string | null): Role | "runner" | null {
  if (!token) return null;
  if (safeEqual(s.runnerToken, token)) return "runner";
  return roleForToken(s.session, token);
}

/** A public relay: account-token-gated deck upload, opaque-origin deck serving,
 *  and a token-gated Yjs WebSocket per session. Decks run their code locally (the
 *  runner connects as a privileged peer); the relay only relays + serves bytes. */
export function createRelay(opts: RelayOptions): RelayServer {
  const cfg = { ...DEFAULTS, ...opts };
  if (!opts.accountTokens.length) throw new Error("createRelay: at least one account token is required");
  const sessions = new Map<string, RelaySession>();

  const dropSession = (s: RelaySession) => {
    if (s.ttl) clearTimeout(s.ttl);
    s.hub.destroy();
    sessions.delete(s.id);
  };

  const server = Bun.serve<WSData>({
    port: opts.port ?? 0,
    hostname: opts.hostname ?? "0.0.0.0",
    async fetch(req, srv) {
      const url = new URL(req.url);
      const { pathname } = url;

      if (pathname === "/healthz") return new Response("ok");

      // --- control API: create a session by uploading a deck ---------------
      if (pathname === "/api/sessions" && req.method === "POST") {
        const account = matchAccount(cfg.accountTokens, bearer(req));
        if (!account) return json({ error: "unauthorized" }, 401);

        const declared = Number(req.headers.get("content-length") ?? "0");
        if (declared > cfg.maxDeckBytes) return json({ error: "deck too large" }, 413);
        const html = await req.text();
        if (Buffer.byteLength(html, "utf8") > cfg.maxDeckBytes) return json({ error: "deck too large" }, 413);
        if (!html.trim()) return json({ error: "empty deck" }, 400);

        const count = [...sessions.values()].filter((s) => s.account === account).length;
        if (count >= cfg.maxSessionsPerAccount) return json({ error: "session quota reached" }, 429);

        const session = createSession();
        const rs: RelaySession = {
          id: session.id,
          account,
          hub: new Hub({ keepaliveMs: cfg.keepaliveMs }),
          html,
          session,
          runnerToken: hex(),
          createdAt: Date.now(),
        };
        rs.ttl = setTimeout(() => dropSession(rs), cfg.sessionTtlMs);
        (rs.ttl as { unref?: () => void }).unref?.();
        sessions.set(rs.id, rs);

        const { http, ws } = originOf(req, opts);
        return json({
          id: rs.id,
          presenterToken: session.presenterToken,
          viewerToken: session.viewerToken,
          runnerToken: rs.runnerToken,
          expiresAt: rs.createdAt + cfg.sessionTtlMs,
          urls: {
            presenter: `${http}/s/${rs.id}?t=${session.presenterToken}`,
            viewer: `${http}/s/${rs.id}?t=${session.viewerToken}`,
            sync: `${ws}/sync/${rs.id}`,
          },
        });
      }

      // --- control API: end a session (owner only) -------------------------
      const del = pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (del && req.method === "DELETE") {
        const account = matchAccount(cfg.accountTokens, bearer(req));
        if (!account) return json({ error: "unauthorized" }, 401);
        const s = sessions.get(del[1]!);
        if (!s || s.account !== account) return json({ error: "not found" }, 404);
        dropSession(s);
        return new Response(null, { status: 204 });
      }

      // --- WebSocket sync --------------------------------------------------
      const sync = pathname.match(/^\/sync\/([^/]+)$/);
      if (sync) {
        const s = sessions.get(sync[1]!);
        if (!s || !relayRole(s, url.searchParams.get("t"))) {
          return new Response("forbidden", { status: 403 });
        }
        const data: WSData = { sessionId: s.id, peer: null };
        return srv.upgrade(req, { data }) ? undefined : new Response("upgrade failed", { status: 400 });
      }

      // --- serve the deck in an opaque sandbox -----------------------------
      const serve = pathname.match(/^\/s\/([^/]+)$/);
      if (serve) {
        const s = sessions.get(serve[1]!);
        const token = url.searchParams.get("t");
        const role = s ? relayRole(s, token) : null;
        // runner token must not load the page (it's WS-only)
        if (!s || !role || role === "runner" || !token) {
          return new Response("Invalid or expired link.", { status: 403 });
        }
        const { http, ws } = originOf(req, opts);
        const wsUrl = `${ws}/sync/${s.id}?t=${token}`;
        const viewer = `${http}/s/${s.id}?t=${s.session.viewerToken}`;
        const body = injectBootstrap(s.html, { ws: wsUrl, session: s.id, role, token, participant: "", viewer });
        return new Response(body, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            // Opaque-origin isolation: no allow-same-origin → the deck can't reach
            // the relay's cookies/API/DOM, and each load is a fresh opaque origin
            // (deck-to-deck isolation). connect-src pins the live socket to us.
            // `allow-fullscreen` is NOT a valid CSP `sandbox` token (it's an
            // iframe/Permissions-Policy feature) — browsers reject it and log a
            // console error. Fullscreen for this top-level doc is governed by the
            // Fullscreen API / Permissions-Policy, not the sandbox directive.
            "content-security-policy": `sandbox allow-scripts; connect-src ${ws} ${http}`,
            "x-content-type-options": "nosniff",
            "referrer-policy": "no-referrer",
          },
        });
      }

      return new Response("not found", { status: 404 });
    },
    websocket: {
      idleTimeout: 120,
      maxPayloadLength: cfg.maxFrameBytes,
      open(socket) {
        const s = sessions.get(socket.data.sessionId);
        if (!s) {
          socket.close();
          return;
        }
        socket.data.peer = s.hub.join((d) => socket.send(d));
      },
      message(socket, msg) {
        if (typeof msg === "string") return;
        const bytes = new Uint8Array(msg as unknown as ArrayBufferLike);
        if (bytes.byteLength > cfg.maxFrameBytes) return;
        socket.data.peer?.recv(bytes);
      },
      close(socket) {
        socket.data.peer?.leave();
      },
    },
  });

  const port = server.port ?? 0;
  return {
    port,
    baseUrl: opts.publicBaseUrl?.replace(/\/$/, "") ?? `http://${opts.hostname ?? "0.0.0.0"}:${port}`,
    sessions,
    stop() {
      for (const s of [...sessions.values()]) dropSession(s);
      server.stop(true);
    },
  };
}
