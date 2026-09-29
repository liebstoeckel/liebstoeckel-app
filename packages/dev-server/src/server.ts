import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { bootInstructions } from "./instructions";
import { createLocalBackend, ensureDevGitignore, readServerInfo, removeServerInfo, writeServerInfo } from "./local-backend";
import { createDevProtocol, type DeckLogEntry } from "./protocol";
import { checkServePlugins, pluginErrorPage, pluginProblemFix, type PluginProblem } from "./serve-plugins";

// The dev-mode server: serves the dev shell (sidebar + the deck in a frame) at
// /, the deck itself at /deck through Bun's dev pipeline (HMR, Fast Refresh),
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

export interface DevServerOptions {
  deckDir: string;
  port?: number;
  hostname?: string;
  /** Skip the Bun HTML dev pipeline and serve only /__dev/* (integration tests). */
  apiOnly?: boolean;
  /** Called once the server has stopped itself (a `/__dev/stop` request). */
  onStop?: () => void;
  /** A `[liebstoeckel]` warning or error the open deck reported, once per
   *  repeat window; also queued for `dev poll` as a `deck_log` event. */
  onDeckLog?: (entry: DeckLogEntry) => void;
}

export interface DevServer {
  port: number;
  token: string;
  url: string;
  /** Bundler plugins from the deck's bunfig.toml that did not resolve at
   *  startup. While non-empty the deck route serves an error page instead of
   *  the deck; it mounts the deck by itself once they resolve. */
  pluginProblems: PluginProblem[];
  stop: () => void;
}

// How often the bundler plugins are resolved again while one is missing, so an
// agent that ran `bun install` hears on `dev poll` that it worked without
// anyone opening the page. Resolving only, so this is cheap.
const PLUGIN_RECHECK_MS = 2_000;

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

/** Where the deck bundle is actually mounted; `/deck` redirects here. */
export function deckRoute(token: string): string {
  return `/deck/${token}`;
}

export async function startDevServer(opts: DevServerOptions): Promise<DevServer> {
  const deckDir = resolve(opts.deckDir);
  const hostname = opts.hostname ?? "127.0.0.1";
  const token = crypto.randomUUID();
  let bridgeJs: string | null = null;
  let shell: ShellBundle | null = null;

  const protocol = createDevProtocol(
    createLocalBackend({
      deckDir,
      token,
      onStop: () => {
        if (recheckTimer) clearInterval(recheckTimer);
        recheckTimer = null;
        removeServerInfo(deckDir, process.pid);
        server.stop(true);
        opts.onStop?.();
      },
    }),
    { onDeckLog: opts.onDeckLog },
  );

  // The deck itself rides Bun's dev pipeline via a dynamic HTML import, which
  // gives HMR + Fast Refresh exactly as a hand-written server.ts would.
  const routes: Record<string, unknown> = {};
  // Bun loads the deck's bunfig.toml plugins on the first deck request and
  // exits the process when one does not resolve. So the HTML import is only
  // mounted once they all resolve; until then `fetch` answers the deck route
  // with an error page that polls `statusPath` and reloads when fixed.
  let pluginProblems: PluginProblem[] = [];
  let deckMounted = false;
  let mounting: Promise<void> | null = null;
  const statusPath = `${deckRoute(token)}/__plugins`;
  async function mountDeck(): Promise<void> {
    const indexPath = join(deckDir, "index.html");
    if (!existsSync(indexPath)) throw new Error(`No index.html in ${deckDir}`);
    const mod = await import(indexPath);
    // Bun answers `routes` before `fetch`, so the Host check below never sees
    // a route. Keying the bundle by the session token keeps a rebinding page
    // out: it cannot know the token without first reading the shell, which
    // the check refuses. `/deck` stays the public name and redirects here.
    routes[deckRoute(token)] = mod.default;
    // A hand-typed trailing slash should not 404 the deck.
    routes[`${deckRoute(token)}/`] = mod.default;
    deckMounted = true;
  }
  /** Tell a polling agent where the plugins stand: the problems and the fix,
   *  or that they resolve again. */
  function announcePlugins(): void {
    const ok = pluginProblems.length === 0;
    protocol.notify({ type: "plugin_status", ok, problems: pluginProblems, ...(ok ? {} : { fix: pluginProblemFix(deckDir) }) });
  }
  const problemsKey = (problems: PluginProblem[]) => JSON.stringify(problems);
  let recheckTimer: ReturnType<typeof setInterval> | null = null;
  /** Resolve the plugins again while the deck is not mounted; mount it once
   *  they all resolve and announce any change to `dev poll`. */
  async function recheckPlugins(): Promise<void> {
    if (deckMounted) return;
    const before = problemsKey(pluginProblems);
    pluginProblems = checkServePlugins(deckDir);
    if (pluginProblems.length === 0) {
      mounting ??= mountDeck().then(() => {
        // The same fetch goes back in, so the Host check, the shell and
        // the protocol stay as they were; only the deck route is added.
        server.reload({ routes: routes as never, fetch: handle, development: { hmr: true, console: true } } as never);
      });
      await mounting;
    }
    if (problemsKey(pluginProblems) !== before) announcePlugins();
    if (deckMounted && recheckTimer) {
      clearInterval(recheckTimer);
      recheckTimer = null;
    }
  }
  if (!opts.apiOnly) {
    if (!existsSync(join(deckDir, "index.html"))) throw new Error(`No index.html in ${deckDir}`);
    pluginProblems = checkServePlugins(deckDir);
    if (pluginProblems.length === 0) await mountDeck();
    else {
      announcePlugins();
      recheckTimer = setInterval(() => void recheckPlugins().catch(() => {}), PLUGIN_RECHECK_MS);
      // Never the reason the process stays up.
      recheckTimer.unref?.();
    }
  }

  const server = Bun.serve({
    port: opts.port ?? 0,
    hostname,
    // Bun closes idle connections after 10s by default, which kills a parked
    // long-poll and starves SSE between heartbeats. 255 is Bun's maximum; the
    // poll timeout (240s) stays below it so the server always answers first.
    idleTimeout: 255,
    development: { hmr: true, console: true },
    ...(Object.keys(routes).length > 0 ? { routes: routes as never } : {}),
    fetch: handle,
  });

  async function handle(req: Request): Promise<Response> {
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
    if (!opts.apiOnly && (p === statusPath || (!deckMounted && (p === deckRoute(token) || p === `${deckRoute(token)}/`)))) {
      await recheckPlugins();
      if (p === statusPath) {
        return Response.json({ ok: pluginProblems.length === 0, problems: pluginProblems }, { headers: { "Cache-Control": "no-store" } });
      }
      if (pluginProblems.length > 0) {
        return new Response(pluginErrorPage(deckDir, pluginProblems, statusPath), {
          status: 503,
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
      // Mounted just now: the next request hits the route itself.
      return Response.redirect(`${deckRoute(token)}/${url.search}`, 302);
    }
    if (p === "/deck" || p === "/deck/") {
      // Host-checked above; the fragment (deck position) survives a redirect.
      return Response.redirect(`${deckRoute(token)}/${url.search}`, 302);
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
      if (recheckTimer) clearInterval(recheckTimer);
      recheckTimer = null;
      protocol.stop();
    },
  };
}

/** Build the in-frame bridge from the sibling drawer/ sources. The entry has
 *  no exports, so the output loads as a classic script. */
async function bridgeBundle(): Promise<string> {
  const entry = join(import.meta.dir, "..", "drawer", "drawer.ts");
  const result = await Bun.build({ entrypoints: [entry], target: "browser", minify: false });
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
