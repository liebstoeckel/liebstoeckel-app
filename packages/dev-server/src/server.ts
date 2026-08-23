import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { bootInstructions } from "./instructions";
import { createLocalBackend, ensureDevGitignore, readServerInfo, removeServerInfo, writeServerInfo } from "./local-backend";
import { createDevProtocol } from "./protocol";

// The dev-mode server: serves the deck through Bun's dev pipeline (HMR, Fast
// Refresh), bundles and serves the drawer, and mounts the /__dev/* protocol
// over the local filesystem backend. One origin for everything so the drawer
// needs no CORS. Security model: a per-boot random token required on every
// route except the two the loader needs before it can know a token
// (/__dev/ping, /__dev/drawer.js, which carries the token to the page, the
// reason the server binds loopback by default and exposing it is an explicit
// flag).

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
  let drawerJs: string | null = null;

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
      if (url.pathname === "/__dev/drawer.js") {
        drawerJs ??= await drawerBundle();
        const prelude = `window.__LIEBSTOECKEL_DEV__=${JSON.stringify({ token })};\n`;
        return new Response(prelude + drawerJs, {
          headers: { "Content-Type": "application/javascript", "Cache-Control": "no-store" },
        });
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

/** Build the drawer bundle from the sibling drawer/ sources. The entry has no
 *  exports, so the output loads as a classic script. */
async function drawerBundle(): Promise<string> {
  const entry = join(import.meta.dir, "..", "drawer", "drawer.ts");
  const result = await Bun.build({ entrypoints: [entry], target: "browser", minify: false });
  if (!result.success) {
    const logs = result.logs.map(String).join("\n");
    throw new Error(`drawer bundle failed:\n${logs}`);
  }
  return await result.outputs[0]!.text();
}

export { bootInstructions, readServerInfo };
