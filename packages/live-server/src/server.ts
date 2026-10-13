import * as os from "node:os";
import type { ServerWebSocket } from "bun";
import { Hub } from "./relay";
import { createSession, roleForToken, buildLinks, type Session, type Links } from "./session";
import { injectBootstrap } from "./inject";
import { CLOSE, LIVE_PROTOCOL, NOTICES_SINCE, TOO_OLD_REASON, negotiateVersion, type LiveNotice } from "./placement/protocol";
import { AudienceCounter } from "./audience";
import { extractManifest, rehydrateServerBundle } from "./manifest";

/** First non-internal IPv4 address (for LAN links / QR). */
export function lanAddress(): string {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === "IPv4" && !ni.internal) return ni.address;
    }
  }
  return "127.0.0.1";
}

export interface ServeOptions {
  /** built deck HTML (ideally with an embedded plugin manifest) */
  html: string;
  port?: number;
  hostname?: string;
  /** host used in the printed links / QR (defaults to the LAN address) */
  publicHost?: string;
}

export interface LiveServer {
  session: Session;
  hub: Hub;
  port: number;
  baseUrl: string;
  links: Links;
  serverPlugins: string[];
  stop(): void;
}

type WSData = {
  peer: ReturnType<Hub["join"]> | null;
  tooOld?: boolean;
  /** the presenter's link (it hears the audience count) rather than a viewer's */
  presenter?: boolean;
  /** the negotiated live protocol version (notices from 2 on) */
  version?: number;
};

/** cap inbound WS frames (Yjs updates for a poll-class deck are tiny) */
const MAX_FRAME_BYTES = 4 * 1024 * 1024;

/** Start a live session server for one deck. Rehydrates & runs any server plugins
 *  from the manifest, serves the deck with the live bootstrap injected, and relays
 *  Yjs over `/sync`. */
export async function startServer(opts: ServeOptions): Promise<LiveServer> {
  const session = createSession();
  // Well inside the live client's 35 s watchdog.
  const hub = new Hub({ keepaliveMs: 10_000 });
  const cleanups: Array<() => void> = [];
  const serverPlugins: string[] = [];

  const manifest = extractManifest(opts.html);
  if (manifest) {
    for (const p of manifest.plugins) {
      if (!p.hasServer || !p.server) continue;
      const mod = await rehydrateServerBundle(p.server, p.name);
      if (typeof mod.default === "function") {
        // Runs the default instance; a multi-instance server plugin enumerates the rest
        // from the doc index (readPluginInstances / observePluginIndex). (internal ADR)/0034.
        const teardown = (mod.default as (ctx: { doc: typeof hub.doc; session: { id: string }; instance: string }) => unknown)({
          doc: hub.doc,
          session: { id: session.id },
          instance: "",
        });
        if (typeof teardown === "function") cleanups.push(teardown as () => void);
        serverPlugins.push(p.name);
      }
    }
  }

  // Presenters hear how many viewers are connected, at most about once a second.
  const presenters = new Set<ServerWebSocket<WSData>>();
  const tell = (ws: ServerWebSocket<WSData>, notice: LiveNotice) => {
    if ((ws.data.version ?? 1) < NOTICES_SINCE) return;
    try {
      ws.send(JSON.stringify(notice));
    } catch {
      /* closing */
    }
  };
  const audience = new AudienceCounter((n) => {
    for (const ws of presenters) tell(ws, { t: "audience", n });
  });

  const server = Bun.serve<WSData>({
    port: opts.port ?? 0,
    hostname: opts.hostname ?? "0.0.0.0",
    fetch(req, srv) {
      const url = new URL(req.url);
      const token = url.searchParams.get("t");

      if (url.pathname === "/sync") {
        const role = roleForToken(session, token);
        if (!role) return new Response("forbidden", { status: 403 });
        // A browser cannot read the body of a refused upgrade, so an old client is
        // let in and then closed with a code that tells it why.
        const negotiated = negotiateVersion(url.searchParams.get("v"), LIVE_PROTOCOL);
        const data: WSData = {
          peer: null,
          tooOld: !negotiated.ok,
          presenter: role === "presenter",
          version: negotiated.ok ? negotiated.version : 0,
        };
        return srv.upgrade(req, { data }) ? undefined : new Response("upgrade failed", { status: 400 });
      }

      if (url.pathname === "/") {
        const role = roleForToken(session, token);
        if (!role || !token) return new Response("Invalid or expired link.", { status: 403 });
        const wsProto = url.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${wsProto}//${url.host}/sync?t=${token}`;
        const viewer = `${url.protocol}//${url.host}/?t=${session.viewerToken}`;
        const body = injectBootstrap(opts.html, { ws: wsUrl, session: session.id, role, token, participant: "", viewer });
        return new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });
      }

      return new Response("not found", { status: 404 });
    },
    websocket: {
      // Bun auto-sends pings (sendPings default) and closes connections idle past
      // this window, so a dead client is detected and its peer cleaned up.
      idleTimeout: 120,
      open(ws) {
        if (ws.data.tooOld) {
          ws.close(CLOSE.PROTOCOL_TOO_OLD, TOO_OLD_REASON);
          return;
        }
        ws.data.peer = hub.join((d) => ws.send(d));
        if (ws.data.presenter) {
          presenters.add(ws);
          tell(ws, { t: "audience", n: audience.n });
        } else audience.join();
      },
      message(ws, msg) {
        if (typeof msg === "string") return;
        const bytes = new Uint8Array(msg as unknown as ArrayBufferLike);
        if (bytes.byteLength > MAX_FRAME_BYTES) return; // drop oversized frames
        ws.data.peer?.recv(bytes); // recv is internally guarded
      },
      close(ws) {
        if (!ws.data.peer) return;
        ws.data.peer.leave();
        ws.data.peer = null;
        if (ws.data.presenter) presenters.delete(ws);
        else audience.leave();
      },
    },
  });

  const host = opts.publicHost ?? lanAddress();
  const port = server.port ?? 0;
  const baseUrl = `http://${host}:${port}`;
  return {
    session,
    hub,
    port,
    baseUrl,
    links: buildLinks(baseUrl, session),
    serverPlugins,
    stop() {
      for (const c of cleanups) c();
      audience.destroy();
      server.stop(true);
      hub.destroy();
    },
  };
}
