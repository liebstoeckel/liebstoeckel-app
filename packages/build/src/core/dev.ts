// The dev server's core, pure TypeScript: a module server (each deck module
// transformed on its own by esbuild, imports pointing at versioned URLs, bare
// specifiers left to the import map of prebuilt dependencies) and the logic of the
// change channel (which modules an edit touches and which hot boundary
// re-imports them). The host puts it behind an HTTP server and a WebSocket.
//
// URLs, all under `base`:
//   <base>/                 the deck's index.html, with the import map and the runtime
//   <base>/@fs/<path>?v=<n> a deck module (or a framework package served as source)
//   <base>/@fs/<path>?css   a stylesheet, as a module that puts it into a <style>
//   <base>/@fs/<path>       an asset (font, image) the module graph resolved
//
// An edit bumps the version of the file and of every importer up to a module that
// accepts itself (`import.meta.hot.accept()`, the deck's main.tsx); the page
// re-imports that boundary. Unchanged modules keep their URL, so the browser keeps
// their instances. Components the refresh pass registered keep their state.
import type { Esbuild } from "./esbuild.ts";
import { readText, type Files } from "./files.ts";
import { htmlEntries } from "./html.ts";
import { formatMessage, toMessages, type BuildMessage, commonOptions } from "./build.ts";
import { extractCandidates, isAsset, loadModule, newLoadContext, type LoadContext, type Notice } from "./load.ts";
import { dirname, extname, join } from "./path.ts";
import { NS, resolveFor } from "./plugin.ts";
import { refreshFooter } from "./refresh.ts";
import { Resolver, type ResolverOptions } from "./resolve.ts";

/** What the host prebuilt for the dev loop. URLs are relative to `<base>/@deps/`. */
export interface DepsManifest {
  /** bare specifier -> file */
  imports: Record<string, string>;
  /** stylesheets the prebuilt dependencies import from JavaScript */
  css: string[];
  /** Tailwind candidates found in the prebuilt dependencies' sources */
  candidates: string[];
}

export interface Served {
  status: number;
  type: string;
  body: string | Uint8Array;
}

/** What the page should do after a change. */
export type DevMessage =
  | { type: "update"; boundaries: string[] }
  | { type: "css"; id: string; text: string }
  | { type: "reload"; reason: string }
  | { type: "error"; errors: BuildMessage[] }
  | { type: "ok" };

interface ModuleInfo {
  /** the transformed code with a placeholder per deck import, filled with the
   *  current URL at serve time, so a version bump never needs a re-transform */
  template: string;
  /** deck files this module imports, in placeholder order */
  imports: string[];
  /** bare specifiers it imports */
  bare: string[];
  accepts: boolean;
}

const PLACEHOLDER = /__LST_URL_(\d+)__/g;
const SOURCE = /\.(tsx?|jsx?|mjs|cjs|mdx|json)$/;
const SOURCE_OR_CODE = /(\.(tsx?|jsx?|mjs|cjs|mdx|json)|\.code\.md)$/;
const REFRESH = /\.(tsx|jsx|mdx)$/;

export interface DevCoreOptions {
  esbuild: Esbuild;
  files: Files;
  /** virtual path of the deck's index.html */
  html: string;
  /** URL prefix everything is served under, without a trailing slash ("" for the root) */
  base: string;
  resolver?: ResolverOptions;
  deps: DepsManifest;
  /** A notice for the author (a deprecation), once per file and message. */
  onNotice?: (n: Notice) => void;
}

export class DevCore {
  readonly resolver: Resolver;
  readonly html: string;
  readonly deckDir: string;
  private ctx: LoadContext;
  private esbuild: Esbuild;
  private files: Files;
  private base: string;
  deps: DepsManifest;
  private versions = new Map<string, number>();
  /** transforms by path, valid while the source text is unchanged */
  private modules = new Map<string, { text: string; info: Promise<ModuleInfo> }>();
  /** modules a page has loaded (only those take part in hot updates) */
  private loaded = new Set<string>();
  private importers = new Map<string, Set<string>>();
  /** Tailwind candidates per source file */
  private sources = new Map<string, Set<string>>();
  /** generated stylesheet text per stylesheet module */
  private cssCache = new Map<string, string>();
  /** stylesheet modules a page has loaded */
  private cssLoaded = new Set<string>();
  /** stylesheets (and Tailwind dependencies) each stylesheet module pulled in */
  private cssDeps = new Map<string, Set<string>>();
  /** paths the graph handed out a URL for: the only ones served from @fs */
  private allowed = new Set<string>();
  /** bare specifiers seen that the prebuilt dependencies lack */
  readonly missing = new Set<string>();
  /** current build problems by file */
  private errors = new Map<string, BuildMessage[]>();
  private notified = new Set<string>();
  private graphReady: Promise<void> | null = null;

  constructor(private opts: DevCoreOptions) {
    this.esbuild = opts.esbuild;
    this.files = opts.files;
    this.base = opts.base;
    this.deps = opts.deps;
    this.html = opts.html;
    this.deckDir = dirname(opts.html);
    this.resolver = new Resolver(opts.files, opts.resolver);
    this.ctx = newLoadContext(opts.files, this.resolver, "development");
    this.ctx.onNotice = (n) => {
      const key = `${n.file}\0${n.message}`;
      if (this.notified.has(key)) return;
      this.notified.add(key);
      opts.onNotice?.(n);
    };
  }

  get runtimeUrl(): string {
    return `${this.base}/@lst/runtime.js`;
  }

  version(path: string): number {
    return this.versions.get(path) ?? 0;
  }

  url(path: string): string {
    this.allowed.add(path);
    return `${this.base}/@fs${encodeURI(path)}?v=${this.version(path)}`;
  }

  cssUrl(path: string): string {
    this.allowed.add(path);
    return `${this.base}/@fs${encodeURI(path)}?css`;
  }

  assetUrl(path: string): string {
    this.allowed.add(path);
    return `${this.base}/@fs${encodeURI(path)}`;
  }

  /** Current problems, every file's. */
  problems(): BuildMessage[] {
    return [...this.errors.values()].flat();
  }

  private setErrors(path: string, list: BuildMessage[] | null): boolean {
    const before = JSON.stringify(this.errors.get(path) ?? null);
    if (list && list.length) this.errors.set(path, list);
    else this.errors.delete(path);
    return before !== JSON.stringify(this.errors.get(path) ?? null);
  }

  /** Serve a request path under `<base>/@fs` (pathname without origin) with its query. */
  async serve(pathname: string, search: URLSearchParams): Promise<Served> {
    const path = decodeURI(pathname.slice(`${this.base}/@fs`.length));
    // Only what the module graph resolved, so this route cannot read the rest of the tree.
    if (!this.allowed.has(path)) return notFound(path);
    try {
      if (search.has("css")) {
        this.cssLoaded.add(path);
        return { status: 200, type: "text/javascript", body: await this.cssModule(path) };
      }
      if (SOURCE_OR_CODE.test(path)) {
        this.loaded.add(path);
        return { status: 200, type: "text/javascript", body: await this.code(path) };
      }
      if (isAsset(path)) {
        const bytes = this.files.read(path);
        return bytes ? { status: 200, type: assetType(path), body: bytes } : notFound(path);
      }
      return notFound(path);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: 500, type: "text/javascript", body: `throw new Error(${JSON.stringify(message)});` };
    }
  }

  /** The deck's index.html for dev: the import map, the dependency stylesheets and
   *  the hot runtime first, the module entries versioned. */
  page(config: Record<string, unknown> = {}): string | null {
    const text = readText(this.files, this.html);
    if (text === null) return null;
    let html = text;
    for (const src of htmlEntries(text).scripts) {
      const abs = join(this.deckDir, src);
      html = html.replace(new RegExp(`(<script\\b[^>]*\\bsrc=["'])${escapeRe(src)}(["'])`), (_m, a: string, b: string) => `${a}${this.url(abs)}${b}`);
    }
    for (const href of htmlEntries(text).styles) {
      const abs = join(this.deckDir, href);
      html = html.replace(new RegExp(`<link\\b[^>]*\\bhref=["']${escapeRe(href)}["'][^>]*>`), `<script type="module" src="${this.cssUrl(abs)}"></script>`);
    }
    const deps = `${this.base}/@deps/`;
    const imports = Object.fromEntries(Object.entries(this.deps.imports).map(([k, v]) => [k, deps + v]));
    const head =
      `<script>window.__LIEBSTOECKEL_DEV_SERVER__=${JSON.stringify({ base: this.base, ...config }).replace(/</g, "\\u003c")}</script>` +
      `<script type="importmap">${JSON.stringify({ imports }).replace(/</g, "\\u003c")}</script>` +
      this.deps.css.map((f) => `<link rel="stylesheet" href="${deps}${f}">`).join("") +
      `<script type="module" src="${this.runtimeUrl}"></script>`;
    return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + head) : head + html;
  }

  module(path: string): Promise<ModuleInfo> {
    const text = readText(this.files, path) ?? "";
    const hit = this.modules.get(path);
    if (hit && hit.text === text) return hit.info;
    const info = this.transform(path);
    this.modules.set(path, { text, info });
    info.then(
      () => {
        this.setErrors(path, null);
      },
      () => {
        if (this.modules.get(path)?.info === info) this.modules.delete(path);
      },
    );
    return info;
  }

  /** The module's code with its imports pointing at the current versions. */
  async code(path: string): Promise<string> {
    const info = await this.module(path);
    return info.template.replace(PLACEHOLDER, (_m, i: string) => this.url(info.imports[Number(i)]!));
  }

  private async transform(path: string): Promise<ModuleInfo> {
    const imports: string[] = [];
    const bare = new Set<string>();
    const self = this;
    const saw = new Set<string>();
    const ctx: LoadContext = { ...this.ctx, onSource: (_p, text) => extractCandidates(text, saw) };
    let result;
    try {
      result = await this.esbuild.build({
        ...commonOptions("development"),
        jsxDev: true,
        entryPoints: [path],
        outdir: "/out",
        sourcemap: "inline",
        sourceRoot: "/",
        plugins: [
          {
            name: "liebstoeckel-dev",
            setup(build) {
              build.onResolve({ filter: /.*/ }, (args) => {
                if (args.kind === "entry-point") return { path: args.path, namespace: NS };
                const spec = args.path;
                if (spec.startsWith("data:") || /^https?:\/\//.test(spec)) return { path: spec, external: true };
                const isBare = !/^[./#]/.test(spec);
                let resolved;
                try {
                  resolved = resolveFor(ctx, spec, args.resolveDir, false);
                } catch (err) {
                  return { errors: [{ text: err instanceof Error ? err.message : String(err) }] };
                }
                if (resolved && "path" in resolved) {
                  const ext = extname(resolved.path);
                  if (ext === ".css") return { path: self.cssUrl(resolved.path), external: true };
                  if (isAsset(resolved.path)) return { path: resolved.path, namespace: "lst-asset" };
                }
                if (isBare) {
                  bare.add(spec);
                  if (!(spec in self.deps.imports)) self.missing.add(spec);
                  return { path: spec, external: true };
                }
                if (!resolved) return { errors: [{ text: `Could not resolve "${spec}"` }] };
                if ("empty" in resolved) return { path: spec, namespace: "lst-empty" };
                let i = imports.indexOf(resolved.path);
                if (i < 0) i = imports.push(resolved.path) - 1;
                return { path: `__LST_URL_${i}__`, external: true };
              });
              build.onLoad({ filter: /.*/, namespace: "lst-empty" }, () => ({ contents: "export default {};", loader: "js" }));
              build.onLoad({ filter: /.*/, namespace: "lst-asset" }, (args) => ({ contents: `export default ${JSON.stringify(self.assetUrl(args.path))};`, loader: "js" }));
              build.onLoad({ filter: /.*/, namespace: NS }, async (args) => {
                let loaded;
                try {
                  loaded = await loadModule(ctx, args.path);
                } catch (err) {
                  return { errors: [{ text: err instanceof Error ? err.message : String(err), location: { file: args.path } }] };
                }
                if (!loaded) return { errors: [{ text: `Could not read ${args.path}` }] };
                // The code step and code files already ran in loadModule; assets are served by URL.
                return { contents: loaded.contents, loader: loaded.loader === "dataurl" ? "file" : loaded.loader, resolveDir: dirname(args.path) };
              });
            },
          },
        ],
      });
    } catch (err) {
      const errors = (err as { errors?: Parameters<typeof toMessages>[0] }).errors;
      const list = errors ? toMessages(errors) : [{ text: err instanceof Error ? err.message : String(err), file: path }];
      this.setErrors(path, list.map((m) => ({ ...m, file: m.file ?? path })));
      throw new Error(list.map(formatMessage).join("\n"));
    }
    this.sources.set(path, saw);
    let code = result.outputFiles?.[0]?.text ?? "";
    const accepts = /import\.meta\.hot\.accept\(/.test(code);
    const prologue: string[] = [];
    if (code.includes("import.meta.hot")) {
      prologue.push(`import { createHot as __lstCreateHot } from "${this.runtimeUrl}";`, `import.meta.hot = __lstCreateHot(${JSON.stringify(path)});`);
    }
    if (REFRESH.test(path) && !path.includes("/node_modules/")) {
      const footer = refreshFooter(code, path, "__lstRefresh");
      if (footer) {
        prologue.push(`import { refresh as __lstRefresh } from "${this.runtimeUrl}";`);
        // Before the inline source map comment, which has to stay last.
        const map = code.lastIndexOf("\n//# sourceMappingURL=");
        code = map >= 0 ? code.slice(0, map) + footer + code.slice(map) : code + footer;
      }
    }
    // On the first line, so the inline source map's lines stay right.
    if (prologue.length) code = prologue.join(" ") + " " + code;
    for (const dep of imports) {
      let set = this.importers.get(dep);
      if (!set) this.importers.set(dep, (set = new Set()));
      set.add(path);
    }
    return { template: code, imports, bare: [...bare].sort(), accepts };
  }

  /** Transform the module graph from the HTML entries: collects every reachable
   *  module's Tailwind candidates and bare imports, so the stylesheet and the
   *  dependency prebuild see the whole deck before the page asks for either. */
  async walk(): Promise<{ bare: string[]; css: string[]; failed: string[] }> {
    const text = readText(this.files, this.html);
    const bare = new Set<string>();
    const css = new Set<string>();
    const failed: string[] = [];
    if (text === null) return { bare: [], css: [], failed: [this.html] };
    const queue = htmlEntries(text).scripts.map((src) => join(this.deckDir, src));
    for (const s of htmlEntries(text).styles) css.add(join(this.deckDir, s));
    const seen = new Set<string>();
    while (queue.length) {
      const p = queue.shift()!;
      if (seen.has(p)) continue;
      seen.add(p);
      const info = await this.module(p).catch(() => null);
      if (!info) {
        failed.push(p);
        continue;
      }
      queue.push(...info.imports);
      for (const b of info.bare) bare.add(b);
    }
    for (const [path] of this.cssDepsFromAllowed()) css.add(path);
    return { bare: [...bare].sort(), css: [...css].sort(), failed };
  }

  private *cssDepsFromAllowed(): Iterable<[string]> {
    for (const p of this.allowed) if (extname(p) === ".css") yield [p];
  }

  /** Make sure the whole graph has been walked once (candidates for the stylesheet). */
  ready(): Promise<void> {
    this.graphReady ??= this.walk().then(() => {});
    return this.graphReady;
  }

  private candidates(): Set<string> {
    const all = new Set(this.deps.candidates);
    for (const set of this.sources.values()) for (const c of set) all.add(c);
    return all;
  }

  /** A stylesheet's text for the page: Tailwind generated from the candidates,
   *  plain CSS imports inlined, url()s pointing at served assets. */
  private async cssText(path: string): Promise<string> {
    const all = this.candidates();
    const deps = new Set<string>([path]);
    const ctx: LoadContext = { ...this.ctx, candidates: () => all };
    const self = this;
    let result;
    try {
      result = await this.esbuild.build({
        ...commonOptions("development"),
        entryPoints: [path],
        outdir: "/out",
        plugins: [
          {
            name: "liebstoeckel-dev-css",
            setup(build) {
              build.onResolve({ filter: /.*/ }, (args) => {
                if (args.kind === "entry-point") return { path: args.path, namespace: NS };
                if (args.path.startsWith("data:") || /^(https?:)?\/\//.test(args.path)) return { path: args.path, external: true };
                const resolved = resolveFor(ctx, args.path, args.resolveDir, true);
                if (!resolved || "empty" in resolved) return { errors: [{ text: `Could not resolve "${args.path}"` }] };
                if (args.kind === "url-token") return { path: self.assetUrl(resolved.path), external: true };
                deps.add(resolved.path);
                return { path: resolved.path, namespace: NS };
              });
              build.onLoad({ filter: /.*/, namespace: NS }, async (args) => {
                let loaded;
                try {
                  loaded = await loadModule(ctx, args.path);
                } catch (err) {
                  return { errors: [{ text: err instanceof Error ? err.message : String(err), location: { file: args.path } }] };
                }
                if (!loaded) return { errors: [{ text: `Could not read ${args.path}` }] };
                return { contents: loaded.contents, loader: "css", resolveDir: dirname(args.path) };
              });
            },
          },
        ],
      });
    } catch (err) {
      const errors = (err as { errors?: Parameters<typeof toMessages>[0] }).errors;
      const list = errors ? toMessages(errors) : [{ text: err instanceof Error ? err.message : String(err), file: path }];
      this.setErrors(path, list.map((m) => ({ ...m, file: m.file ?? path })));
      throw new Error(list.map(formatMessage).join("\n"));
    }
    this.setErrors(path, null);
    const root = await this.ctx.tailwindRoots.get(path)?.catch(() => null);
    for (const d of root?.dependencies ?? []) deps.add(d);
    this.cssDeps.set(path, deps);
    const css = result.outputFiles?.find((f) => f.path.endsWith(".css"))?.text ?? "";
    this.cssCache.set(path, css);
    return css;
  }

  private async cssModule(path: string): Promise<string> {
    await this.ready();
    const css = this.cssCache.get(path) ?? (await this.cssText(path));
    return `import { style } from "${this.runtimeUrl}";\nstyle(${JSON.stringify(path)}, ${JSON.stringify(css)});\n`;
  }

  /** Apply changed files (virtual paths; the tree already holds the new content)
   *  and work out the messages for the page. */
  async change(paths: string[]): Promise<DevMessage[]> {
    const messages: DevMessage[] = [];
    const boundaries = new Set<string>();
    let reload: string | null = null;
    let errorsChanged = false;
    const sourceChanged: string[] = [];
    for (const path of paths) {
      if (path === this.html) {
        reload = "index.html changed";
        continue;
      }
      if (path.endsWith("/package.json") || /\/(bun\.lockb?|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(path)) {
        reload = `${path.slice(path.lastIndexOf("/") + 1)} changed`;
        continue;
      }
      if (!SOURCE_OR_CODE.test(path) && extname(path) !== ".css") continue;
      if (extname(path) === ".css") continue; // stylesheets below
      const known = this.modules.has(path) || this.loaded.has(path);
      if (!known) continue;
      if (this.files.stat(path) !== "file") {
        // A module the page uses is gone: its importers can only fail now.
        this.modules.delete(path);
        if (this.loaded.has(path)) reload = `${path} was removed`;
        continue;
      }
      // Transform first: a broken edit shows the overlay and leaves the page alone.
      const info = await this.module(path).catch(() => null);
      errorsChanged = true;
      if (!info) continue;
      sourceChanged.push(path);
      if (!this.loaded.has(path)) continue;
      const queue = [path];
      const seen = new Set<string>();
      while (queue.length) {
        const p = queue.shift()!;
        if (seen.has(p)) continue;
        seen.add(p);
        if (!this.loaded.has(p)) continue; // never loaded by a page: nothing to swap
        this.versions.set(p, this.version(p) + 1);
        const pinfo = p === path ? info : await this.module(p).catch(() => null);
        if (pinfo?.accepts) {
          boundaries.add(p);
          continue;
        }
        const up = [...(this.importers.get(p) ?? [])].filter((u) => this.modules.has(u) || this.loaded.has(u));
        if (up.length === 0) reload ??= `${p} changed and nothing accepts the update`;
        else queue.push(...up);
      }
    }
    if (errorsChanged || paths.some((p) => this.errors.has(p))) {
      const list = this.problems();
      messages.push(list.length ? { type: "error", errors: list } : { type: "ok" });
    }
    if (reload) {
      messages.push({ type: "reload", reason: reload });
      return messages;
    }
    if (boundaries.size) messages.push({ type: "update", boundaries: [...boundaries].map((b) => this.url(b)) });
    // Stylesheets: an edited stylesheet (or one it pulls in), and Tailwind's output
    // for new candidates from the edited sources.
    const cssTouched = paths.filter((p) => extname(p) === ".css");
    for (const id of this.cssLoaded) {
      const deps = this.cssDeps.get(id) ?? new Set([id]);
      const touched = cssTouched.some((p) => deps.has(p));
      if (touched) this.ctx.tailwindRoots.delete(id);
      if (!touched && sourceChanged.length === 0) continue;
      const before = this.cssCache.get(id);
      const after = await this.cssText(id).catch(() => null);
      if (after === null) {
        messages.push({ type: "error", errors: this.problems() });
        continue;
      }
      if (after !== before) messages.push({ type: "css", id, text: after });
    }
    return messages;
  }
}

function notFound(path: string): Served {
  return { status: 404, type: "text/plain", body: `not found: ${path}` };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const TYPES: Record<string, string> = {
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".pdf": "application/pdf",
};

export function assetType(path: string): string {
  return TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}
