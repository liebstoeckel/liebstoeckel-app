import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Server } from "bun";
import { createDeckDev, type DeckDev, type WsData } from "@liebstoeckel/build/dev";
import { bootInstructions } from "./instructions";
import { createLocalBackend, ensureDevGitignore, readServerInfo, removeServerInfo, writeServerInfo } from "./local-backend";
import { createDevProtocol, type DeckLogEntry } from "./protocol";
import { checkServePlugins, pluginProblemFix, type PluginProblem } from "./serve-plugins";

// The dev-mode server: serves the dev shell (sidebar + the deck in a frame) at
// /, the deck itself at /deck/<token>/ through the build core's dev server (hot
// reload with React Fast Refresh, prebuilt dependencies, its own error overlay),
// the in-frame bridge the deck's loader tag pulls in, and the /__dev/* protocol
// over the local filesystem backend. One origin for everything so the drawer
// needs no CORS. Security model: a per-boot random token required on every
// route except what a browser needs before it can know a token (/__dev/ping,
// the bridge script, the shell document, which carries the token to its own
// page, the reason the server binds loopback by default and exposing it is an
// explicit flag). Loopback alone does not stop a hostile web page from
// rebinding its own DNS name to 127.0.0.1 and reading the shell (and its
// token) as if same-origin, so every request must also carry a Host header
// naming this machine: localhost, a loopback literal, or the bound hostname.
// The deck's routes sit under the token as well, so a page that cannot read the
// shell cannot name them.

export interface DevServerOptions {
  deckDir: string;
  port?: number;
  hostname?: string;
  /** Skip the deck's dev server and serve only /__dev/* (integration tests). */
  apiOnly?: boolean;
  /** Called once the server has stopped itself (a `/__dev/stop` request). */
  onStop?: () => void;
  /** A `[liebstoeckel]` warning or error the open deck reported, once per
   *  repeat window; also queued for `dev poll` as a `deck_log` event. */
  onDeckLog?: (entry: DeckLogEntry) => void;
  /** The deck's build problems whenever they change (empty: it builds again);
   *  also queued for `dev poll` as a `build_status` event. */
  onBuildStatus?: (problems: string[]) => void;
  /** A notice about the deck's source (a deprecated form), once per file. */
  onNotice?: (line: string) => void;
}

export interface DevServer {
  port: number;
  token: string;
  url: string;
  /** Bun bundler plugins the deck's bunfig.toml asks for, which the build core
   *  does not run; the deck page shows them until they are removed. */
  pluginProblems: PluginProblem[];
  stop: () => void;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"]);

/** Whether a request's Host header names this machine. Binding a wildcard
 *  address is the explicit "expose me" flag: the machine is then reached by
 *  whatever LAN address or name the user typed, so any Host passes. Exported
 *  for tests. */
export function hostAllowed(hostHeader: string | null, boundHostname: string): boolean {
  if (boundHostname === "0.0.0.0" || boundHostname === "::" || boundHostname === "[::]") return true;
  if (!hostHeader) return false;
  // Strip the port: "host:port", "[v6]:port", or bare.
  const host = hostHeader.startsWith("[")
    ? hostHeader.slice(0, hostHeader.indexOf("]") + 1)
    : hostHeader.replace(/:\d+$/, "");
  const lower = host.toLowerCase();
  return LOCAL_HOSTS.has(lower) || lower === boundHostname.toLowerCase() || lower === `[${boundHostname.toLowerCase()}]`;
}

/** Where the deck is mounted; `/deck` redirects here. */
export function deckRoute(token: string): string {
  return `/deck/${token}`;
}

export async function startDevServer(opts: DevServerOptions): Promise<DevServer> {
  const deckDir = resolve(opts.deckDir);
  const hostname = opts.hostname ?? "127.0.0.1";
  const token = crypto.randomUUID();
  let bridgeJs: string | null = null;
  let shell: ShellBundle | null = null;
  let deck: DeckDev | null = null;

  const protocol = createDevProtocol(
    createLocalBackend({
      deckDir,
      token,
      onStop: () => {
        removeServerInfo(deckDir, process.pid);
        deck?.close();
        server.stop(true);
        opts.onStop?.();
      },
    }),
    { onDeckLog: opts.onDeckLog },
  );

  let pluginProblems: PluginProblem[] = [];
  if (!opts.apiOnly) {
    if (!existsSync(join(deckDir, "index.html"))) throw new Error(`No index.html in ${deckDir}`);
    pluginProblems = checkServePlugins(deckDir);
    if (pluginProblems.length > 0) {
      protocol.notify({ type: "plugin_status", ok: false, problems: pluginProblems, fix: pluginProblemFix(deckDir) });
    }
    let firstStatus = true;
    deck = await createDeckDev({
      deckDir,
      base: deckRoute(token),
      onProblems: (lines) => {
        // bunfig.toml's plugins come through plugin_status; the build's own problems here.
        const now = checkServePlugins(deckDir);
        if (JSON.stringify(now) !== JSON.stringify(pluginProblems)) {
          pluginProblems = now;
          protocol.notify({ type: "plugin_status", ok: now.length === 0, problems: now, ...(now.length ? { fix: pluginProblemFix(deckDir) } : {}) });
        }
        const problems = lines.filter((l) => !l.startsWith("bunfig.toml: "));
        if (firstStatus && problems.length === 0) {
          firstStatus = false;
          return;
        }
        firstStatus = false;
        opts.onBuildStatus?.(problems);
        protocol.notify({ type: "build_status", ok: problems.length === 0, problems });
      },
      onNotice: opts.onNotice,
    });
  }

  const server: Server<WsData> = Bun.serve<WsData>({
    port: opts.port ?? 0,
    hostname,
    // Bun closes idle connections after 10s by default, which kills a parked
    // long-poll and starves SSE between heartbeats. 255 is Bun's maximum; the
    // poll timeout (240s) stays below it so the server always answers first.
    idleTimeout: 255,
    fetch: handle,
    websocket: deck?.websocket ?? { message() {} },
  });

  async function handle(req: Request, srv: Server<WsData>): Promise<Response | undefined> {
    if (!hostAllowed(req.headers.get("host"), hostname)) {
      return new Response("Forbidden: unexpected Host header", { status: 403 });
    }
    const url = new URL(req.url);
    const p = url.pathname;
    // The in-frame bridge. /__dev/drawer.js is a permanent alias: decks
    // scaffolded with the earlier loader tag request it, and the scaffold
    // migration never rewrites a tag that is already present.
    if (p === "/__dev/bridge.js" || p === "/__dev/drawer.js") {
      bridgeJs ??= await bridgeBundle();
      return new Response(bridgeJs, { headers: { "Content-Type": "application/javascript", "Cache-Control": "no-store" } });
    }
    if (p === "/deck" || p === "/deck/") {
      // Host-checked above; the fragment (deck position) survives a redirect.
      return Response.redirect(`${deckRoute(token)}/${url.search}`, 302);
    }
    if (deck) {
      const answered = await deck.fetch(req, srv);
      if (answered !== null) return answered;
    }
    if (p === "/" || p === "/index.html" || p === "/__dev" || p === "/__dev/") {
      shell ??= await shellBundle();
      return new Response(shellHtml(shell, token), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (p.startsWith("/__dev/") && /\.(js|css|woff2?|png|svg)$/.test(p)) {
      shell ??= await shellBundle();
      const asset = shell.assets.get(p.slice("/__dev/".length));
      if (asset) return new Response(asset.bytes, { headers: { "Content-Type": asset.type, "Cache-Control": "no-store" } });
    }
    const handled = await protocol.handleDevRequest(req);
    if (handled) return handled;
    return new Response("Not found", { status: 404 });
  }

  writeServerInfo(deckDir, { port: server.port!, token, hostname });
  ensureDevGitignore(deckDir);

  return {
    port: server.port!,
    token,
    url: `http://${hostname === "0.0.0.0" ? "localhost" : hostname}:${server.port}`,
    pluginProblems,
    stop: () => {
      deck?.close();
      protocol.stop();
    },
  };
}

/** Build the in-frame bridge from the sibling drawer/ sources. It loads as a
 *  classic script, so it is wrapped in a function: nothing it declares may land in
 *  the deck page's global scope (a top-level `CSS` once hid the browser's own). */
async function bridgeBundle(): Promise<string> {
  const entry = join(import.meta.dir, "..", "drawer", "drawer.ts");
  const result = await Bun.build({ entrypoints: [entry], target: "browser", format: "iife", minify: false });
  if (!result.success) {
    const logs = result.logs.map(String).join("\n");
    throw new Error(`bridge bundle failed:\n${logs}`);
  }
  return await result.outputs[0]!.text();
}

interface ShellBundle {
  css: boolean;
  /** Emitted files (script, stylesheet, fonts) by basename, served under /__dev/. */
  assets: Map<string, { bytes: ArrayBuffer; type: string }>;
}

const MIME: Record<string, string> = {
  ".js": "application/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

/** Build the shell document's script (React sidebar + frame host) from ui/,
 *  with its CSS and the font files it references, all served from /__dev/ so
 *  relative url()s resolve. */
async function shellBundle(): Promise<ShellBundle> {
  const entry = join(import.meta.dir, "..", "ui", "shell-entry.tsx");
  const result = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    minify: false,
    publicPath: "/__dev/",
    naming: { entry: "shell.[ext]", chunk: "[name]-[hash].[ext]", asset: "[name]-[hash].[ext]" },
  });
  if (!result.success) {
    const logs = result.logs.map(String).join("\n");
    throw new Error(`shell bundle failed:\n${logs}`);
  }
  const assets = new Map<string, { bytes: ArrayBuffer; type: string }>();
  for (const output of result.outputs) {
    const name = output.path.split("/").pop()!;
    const ext = name.slice(name.lastIndexOf("."));
    assets.set(name, { bytes: await output.arrayBuffer(), type: MIME[ext] ?? "application/octet-stream" });
  }
  return { css: assets.has("shell.css"), assets };
}

function shellHtml(bundle: ShellBundle, token: string): string {
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    "<title>liebstoeckel dev</title>" +
    (bundle.css ? '<link rel="stylesheet" href="/__dev/shell.css">' : "") +
    "<style>html,body,#root{margin:0;height:100%;background:#10140e}</style>" +
    '</head><body><div id="root"></div>' +
    // The frame mounts the deck at its token path directly, no bounce through /deck.
    `<script>window.__LIEBSTOECKEL_DEV__=${JSON.stringify({ token, deckRoute: deckRoute(token) })}</script>` +
    '<script type="module" src="/__dev/shell.js"></script></body></html>'
  );
}

export { bootInstructions, readServerInfo };
