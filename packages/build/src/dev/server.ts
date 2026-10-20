// The deck dev server on the host: the core's module server and change logic
// behind a fetch handler and a WebSocket change channel, a file watcher (or
// `notify` from a host that writes the files itself), the dependency prebuild and
// the dev runtime. It mounts under a URL prefix, so `liebstoeckel dev` can put it
// at /deck/<token> next to its own routes and the hosted preview at /.
import { existsSync, mkdirSync, readdirSync, statSync, watch, writeFileSync, type FSWatcher } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { Server, ServerWebSocket, WebSocketHandler } from "bun";
import { DevCore, type DevMessage } from "../core/dev.ts";
import { isAsset } from "../core/load.ts";
import { assetType } from "../core/dev.ts";
import { esbuild } from "../esbuild-native.ts";
import { bunfigProblems, deckTree, LOCAL, type Profile } from "../profile.ts";
import { EMPTY_DEPS, prebuildDeps } from "./deps.ts";

export interface DeckDevOptions {
  /** the deck folder (holding index.html) */
  deckDir: string;
  /** URL prefix, without a trailing slash ("" serves the deck at /) */
  base?: string;
  profile?: Profile;
  /** Watch the deck folder for changes (default true). A host that writes the
   *  files itself (the hosted preview) passes false and calls `notify`. */
  watch?: boolean;
  /** Where the dependency prebuild is cached (default <deck>/.liebstoeckel/cache/deps,
   *  which gets a .gitignore of its own). */
  cacheDir?: string;
  /** Delay before the page shows a build error (ms, default 0). */
  overlayDelayMs?: number;
  /** Require the WebSocket's Origin to name the request's own host (default true;
   *  the hosted preview runs in an opaque origin, whose Origin is "null"). */
  checkOrigin?: boolean;
  /** The build's current problems as lines (empty when it builds again). */
  onProblems?: (lines: string[]) => void;
  /** A notice for the author (a deprecation), once per file. */
  onNotice?: (line: string) => void;
  /** Progress lines (prebuild timings, reloads). */
  log?: (line: string) => void;
}

export interface WsData {
  liebstoeckelDev: true;
}

export interface DeckDev {
  /** Answer a request: null when its path is not under `base`, undefined when it
   *  was upgraded to the change channel (Bun wants no response then). */
  fetch(req: Request, server: Server<WsData>): Promise<Response | null | undefined>;
  websocket: WebSocketHandler<WsData>;
  /** Files that changed on disk (real paths), for hosts that do not watch. */
  notify(paths: string[]): Promise<void>;
  /** Resolves once the module graph is walked and the dependencies are prebuilt. */
  ready: Promise<void>;
  close(): void;
}

let runtimeJs: Promise<string> | null = null;

/** The page's dev runtime, bundled once per process. */
function runtime(): Promise<string> {
  runtimeJs ??= esbuild
    .build({
      entryPoints: [join(import.meta.dir, "client", "runtime.ts")],
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      target: "es2022",
      define: { "process.env.NODE_ENV": '"development"' },
      logLevel: "silent",
    })
    .then((r) => r.outputFiles[0]!.text);
  return runtimeJs;
}

const IGNORED = /(^|\/)(node_modules|\.git|\.liebstoeckel|dist)(\/|$)/;

export async function createDeckDev(opts: DeckDevOptions): Promise<DeckDev> {
  const deckDir = resolve(opts.deckDir);
  const base = (opts.base ?? "").replace(/\/+$/, "");
  const profile = opts.profile ?? LOCAL;
  const log = opts.log ?? (() => {});
  const tree = deckTree(deckDir, profile);
  const html = tree.disk.virtual(join(deckDir, "index.html"));
  if (html === null) throw new Error(`no index.html in ${deckDir}`);
  const cacheDir = opts.cacheDir ?? join(deckDir, ".liebstoeckel", "cache", "deps");
  if (!opts.cacheDir) {
    // Never part of the deck's history, whatever the deck's own .gitignore says.
    const ignore = join(deckDir, ".liebstoeckel", "cache", ".gitignore");
    if (!existsSync(ignore)) {
      mkdirSync(dirname(ignore), { recursive: true });
      writeFileSync(ignore, "# liebstoeckel's dependency prebuild for the dev server; safe to delete\n*\n");
    }
  }
  const core = new DevCore({
    esbuild,
    files: tree.files,
    html,
    base,
    resolver: tree.resolver,
    deps: EMPTY_DEPS,
    onNotice: (n) => opts.onNotice?.(`${relative(deckDir, tree.disk.real(n.file)).split(sep).join("/")}: ${n.message}`),
  });
  const sockets = new Set<ServerWebSocket<WsData>>();
  let depsDir = "";
  let tooling = profile.name === "local" ? bunfigProblems(deckDir) : [];

  let prebuildError: string | null = null;
  const problemLines = () => [
    ...tooling.map((p) => `${p.file}: ${p.message}`),
    ...(prebuildError ? [`the dependency prebuild failed: ${prebuildError}`] : []),
    ...core.problems().map((m) => {
      const file = m.file ? relative(deckDir, tree.disk.real(m.file)).split(sep).join("/") : "";
      return `${file ? `${file}${m.line ? `:${m.line}${m.column ? `:${m.column}` : ""}` : ""}: ` : ""}${m.text}`;
    }),
  ];
  const overlayErrors = () => [
    ...tooling.map((p) => ({ text: p.message, file: p.file })),
    ...(prebuildError ? [{ text: `the dependency prebuild failed: ${prebuildError}` }] : []),
    ...core.problems().map((m) => ({ ...m, ...(m.file ? { file: relative(deckDir, tree.disk.real(m.file)).split(sep).join("/") } : {}) })),
  ];
  let lastProblems = "[]";
  const reportProblems = () => {
    const lines = problemLines();
    const key = JSON.stringify(lines);
    if (key === lastProblems) return;
    lastProblems = key;
    opts.onProblems?.(lines);
  };

  const broadcast = (m: DevMessage) => {
    // Errors carry deck-relative paths, as the terminal shows them.
    const out = m.type === "error" ? { type: "error", errors: overlayErrors() } : m.type === "ok" && tooling.length ? { type: "error", errors: overlayErrors() } : m;
    const text = JSON.stringify(out);
    for (const ws of sockets) ws.send(text);
  };

  async function prebuild(): Promise<void> {
    const { bare } = await core.walk();
    const specs = [...new Set([...bare, ...core.missing, ...Object.keys(core.deps.imports)])];
    let built;
    try {
      built = await prebuildDeps(tree, specs, cacheDir);
      prebuildError = null;
    } catch (err) {
      // The page still loads and shows this; a later change prebuilds again.
      prebuildError = err instanceof Error ? err.message : String(err);
      log(`the dependency prebuild failed: ${prebuildError}`);
      for (const s of specs) core.missing.add(s);
      return;
    }
    core.deps = built.manifest;
    core.missing.clear();
    depsDir = built.dir;
    log(`${built.cached ? "dependencies from the cache" : "prebuilt dependencies"} (${Object.keys(built.manifest.imports).length} entries, ${Math.round(built.ms)} ms)`);
  }

  const ready = prebuild()
    .then(() => core.ready())
    .then(reportProblems);

  // Changes arrive in bursts (an editor's save, git checkout): collect them briefly.
  let pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> = Promise.resolve();
  const flush = () => {
    timer = null;
    const paths = [...pending];
    pending = new Set();
    running = running.then(async () => {
      await ready;
      if (profile.name === "local" && paths.some((p) => p.endsWith("/bunfig.toml"))) {
        tooling = bunfigProblems(deckDir);
        broadcast(tooling.length || core.problems().length ? { type: "error", errors: [] } : { type: "ok" });
      }
      const messages = await core.change(paths);
      if (core.missing.size > 0) {
        log(`new dependencies (${[...core.missing].join(", ")}): prebuilding again`);
        await prebuild().catch((err) => log(`the prebuild failed: ${err instanceof Error ? err.message : String(err)}`));
        broadcast({ type: "reload", reason: "new dependencies" });
        reportProblems();
        return;
      }
      for (const m of messages) broadcast(m);
      reportProblems();
    });
  };
  const queue = (virtualPaths: string[]) => {
    for (const p of virtualPaths) pending.add(p);
    if (!timer) timer = setTimeout(flush, 25);
  };
  const notify = async (paths: string[]) => {
    const v = paths.map((p) => tree.disk.virtual(resolve(p))).filter((p): p is string => p !== null);
    queue(v);
    await new Promise((r) => setTimeout(r, 30));
    await running;
  };

  // The deck folder itself without recursion, and each of its subfolders
  // recursively, except node_modules and the like: a deck with its own install
  // holds tens of thousands of folders there, and a recursive watch on the deck
  // would put a watch on each.
  const watchers = new Map<string, FSWatcher>();
  const onChange = (dir: string) => (_event: string, name: string | Buffer | null) => {
    if (!name) return;
    const rel = relative(deckDir, join(dir, String(name))).split(sep).join("/");
    if (IGNORED.test(rel)) return;
    if (dir === deckDir) watchFolder(rel);
    queue([tree.disk.virtual(join(deckDir, rel)) ?? `${tree.deck}/${rel}`]);
  };
  const watchFolder = (rel: string) => {
    if (rel.includes("/") || watchers.has(rel) || IGNORED.test(`${rel}/`)) return;
    const abs = join(deckDir, rel);
    try {
      if (!statSync(abs).isDirectory()) return;
      watchers.set(rel, watch(abs, { recursive: true }, onChange(abs)));
    } catch {
      // gone again, or not readable
    }
  };
  if (opts.watch !== false) {
    watchers.set("", watch(deckDir, onChange(deckDir)));
    for (const name of readdirSync(deckDir)) watchFolder(name);
  }

  const noStore = { "Cache-Control": "no-cache" };

  return {
    ready,
    notify,
    websocket: {
      open(ws) {
        sockets.add(ws);
        const errors = overlayErrors();
        if (errors.length) ws.send(JSON.stringify({ type: "error", errors }));
      },
      message() {},
      close(ws) {
        sockets.delete(ws);
      },
    },
    async fetch(req, server) {
      const url = new URL(req.url);
      const p = url.pathname;
      if (p !== base && !p.startsWith(`${base}/`)) return null;
      // The page's relative URLs need the trailing slash.
      if (base && p === base) return Response.redirect(`${base}/${url.search}`, 302);
      const rest = p.slice(base.length) || "/";
      if (rest === "/@lst/hmr") {
        if (opts.checkOrigin !== false) {
          const origin = req.headers.get("origin");
          if (origin && new URL(origin).host !== url.host) return new Response("Forbidden: cross-origin change channel", { status: 403 });
        }
        if (server.upgrade(req, { data: { liebstoeckelDev: true } })) return undefined;
        return new Response("expected a WebSocket", { status: 400 });
      }
      if (rest === "/@lst/runtime.js") {
        return new Response(await runtime(), { headers: { "Content-Type": "text/javascript; charset=utf-8", ...noStore } });
      }
      if (rest === "/" || rest === "/index.html") {
        await ready;
        const page = core.page({ overlayDelayMs: opts.overlayDelayMs ?? 0 });
        if (page === null) return new Response("no index.html", { status: 404 });
        return new Response(page, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
      }
      if (rest.startsWith("/@deps/")) {
        await ready;
        const name = decodeURIComponent(rest.slice("/@deps/".length));
        if (!depsDir || name.split("/").some((s) => s === ".." || s === "" || s.startsWith("."))) return new Response("not found", { status: 404 });
        const file = Bun.file(join(depsDir, name));
        if (!(await file.exists())) return new Response("not found", { status: 404 });
        const type = name.endsWith(".js") ? "text/javascript; charset=utf-8" : name.endsWith(".css") ? "text/css; charset=utf-8" : assetType(name);
        return new Response(file, { headers: { "Content-Type": type, "Cache-Control": "max-age=31536000, immutable" } });
      }
      if (rest.startsWith("/@fs/")) {
        await ready;
        const served = await core.serve(p, url.searchParams);
        return new Response(served.body as BodyInit, { status: served.status, headers: { "Content-Type": served.type, ...noStore } });
      }
      // A file the page references by a relative URL (an image in index.html): only
      // assets inside the deck folder, never dot files or node_modules.
      const rel = decodeURIComponent(rest.slice(1));
      if (rel && isAsset(rel) && !rel.split("/").some((s) => s === ".." || s.startsWith(".") || s === "node_modules")) {
        const file = Bun.file(join(deckDir, rel));
        if (await file.exists()) return new Response(file, { headers: { "Content-Type": assetType(rel), ...noStore } });
      }
      return new Response("not found", { status: 404 });
    },
    close() {
      for (const w of watchers.values()) w.close();
      watchers.clear();
      for (const ws of sockets) ws.close();
      sockets.clear();
    },
  };
}
