import * as os from "node:os";
import { Hub } from "./relay";
import { createSession, roleForToken, buildLinks, type Session, type Links } from "./session";
import { injectBootstrap } from "./inject";
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

type WSData = { peer: ReturnType<Hub["join"]> | null };

/** cap inbound WS frames (Yjs updates for a poll-class deck are tiny) */
const MAX_FRAME_BYTES = 4 * 1024 * 1024;

/** Start a live session server for one deck. Rehydrates & runs any server plugins
 *  from the manifest, serves the deck with the live bootstrap injected, and relays
 *  Yjs over `/sync`. */
export async function startServer(opts: ServeOptions): Promise<LiveServer> {
  const session = createSession();
  const hub = new Hub({ keepaliveMs: 25_000 });
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

  const server = Bun.serve<WSData>({
    port: opts.port ?? 0,
    hostname: opts.hostname ?? "0.0.0.0",
    fetch(req, srv) {
      const url = new URL(req.url);
      const token = url.searchParams.get("t");

      if (url.pathname === "/sync") {
        if (!roleForToken(session, token)) return new Response("forbidden", { status: 403 });
        const data: WSData = { peer: null };
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
        ws.data.peer = hub.join((d) => ws.send(d));
      },
      message(ws, msg) {
        if (typeof msg === "string") return;
        const bytes = new Uint8Array(msg as unknown as ArrayBufferLike);
        if (bytes.byteLength > MAX_FRAME_BYTES) return; // drop oversized frames
        ws.data.peer?.recv(bytes); // recv is internally guarded
      },
      close(ws) {
        ws.data.peer?.leave();
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
      server.stop(true);
      hub.destroy();
    },
  };
}
