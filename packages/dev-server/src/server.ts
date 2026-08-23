import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { bootInstructions } from "./instructions";
import { createLocalBackend, ensureDevGitignore, readServerInfo, removeServerInfo, writeServerInfo } from "./local-backend";
import { createDevProtocol } from "./protocol";

// The dev-mode server: serves the deck at / through Bun's dev pipeline (HMR,
// Fast Refresh), the dev shell (sidebar + the deck in a frame) at /__dev/,
// the in-frame bridge the deck's loader tag pulls in, and the /__dev/* protocol
// over the local filesystem backend. One origin for everything so the drawer
// needs no CORS. Security model: a per-boot random token required on every
// route except what a browser needs before it can know a token (/__dev/ping,
// the bridge script, the shell document, which carries the token to its own
// page, the reason the server binds loopback by default and exposing it is an
// explicit flag).

export interface DevServerOptions {
  deckDir: string;
  port?: number;
  hostname?: string;
  /** Skip the Bun HTML dev pipeline and serve only /__dev/* (integration tests). */
  apiOnly?: boolean;
}

export interface DevServer {
  port: number;
  token: string;
  url: string;
  stop: () => void;
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
        removeServerInfo(deckDir);
        server.stop(true);
      },
    }),
  );

  // The deck itself rides Bun's dev pipeline via a dynamic HTML import, which
  // gives HMR + Fast Refresh exactly as a hand-written server.ts would.
  const routes: Record<string, unknown> = {};
  if (!opts.apiOnly) {
    const indexPath = join(deckDir, "index.html");
    if (!existsSync(indexPath)) throw new Error(`No index.html in ${deckDir}`);
    const mod = await import(indexPath);
    routes["/"] = mod.default;
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
    fetch: async (req) => {
      const url = new URL(req.url);
      const p = url.pathname;
      // The in-frame bridge. /__dev/drawer.js stays answered for one release so a
      // deck tab opened before the upgrade reloads cleanly.
      if (p === "/__dev/bridge.js" || p === "/__dev/drawer.js") {
        bridgeJs ??= await bridgeBundle();
        return new Response(bridgeJs, { headers: { "Content-Type": "application/javascript", "Cache-Control": "no-store" } });
      }
      if (p === "/__dev" || p === "/__dev/" || p === "/__dev/index.html") {
        shell ??= await shellBundle();
        return new Response(shellHtml(shell, token), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
      }
      if (p.startsWith("/__dev/") && shell?.assets.has(p.slice("/__dev/".length))) {
        const asset = shell.assets.get(p.slice("/__dev/".length))!;
        return new Response(asset.bytes, { headers: { "Content-Type": asset.type, "Cache-Control": "no-store" } });
      }
      const handled = await protocol.handleDevRequest(req);
      if (handled) return handled;
      return new Response("Not found", { status: 404 });
    },
  });

  writeServerInfo(deckDir, { port: server.port!, token });
  ensureDevGitignore(deckDir);

  return {
    port: server.port!,
    token,
    url: `http://${hostname === "0.0.0.0" ? "localhost" : hostname}:${server.port}`,
    stop: () => protocol.stop(),
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
    `<script>window.__LIEBSTOECKEL_DEV__=${JSON.stringify({ token })}</script>` +
    '<script type="module" src="/__dev/shell.js"></script></body></html>'
  );
}

export { bootInstructions, readServerInfo };
