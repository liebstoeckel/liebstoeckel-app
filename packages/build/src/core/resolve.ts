// Node-style module resolution over the Files seam: relative paths with extension
// probing, bare specifiers through node_modules, package.json `exports`, `imports`,
// `browser` (string and map form), `module` and `main`. esbuild has its own
// resolver, but it reads the real filesystem (and in the browser there is none), so
// the core resolves everything itself and hands esbuild finished paths.
import { readText, type Files } from "./files.ts";
import { dirname, join, normalize } from "./path.ts";

export interface ResolveOptions {
  conditions: string[];
  extensions: string[];
}

export const JS_RESOLVE: ResolveOptions = {
  conditions: ["browser", "import", "module", "default"],
  extensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".json", ".mdx", ".css"],
};

export const CSS_RESOLVE: ResolveOptions = {
  conditions: ["style", "browser", "import", "default"],
  extensions: [".css"],
};

/** What a specifier resolved to: a file, or an empty module (`browser: { "fs": false }`). */
export type Resolved = { path: string } | { empty: true };

interface PkgJson {
  name?: string;
  main?: string;
  module?: string;
  browser?: string | Record<string, string | false>;
  exports?: unknown;
  imports?: unknown;
  sideEffects?: boolean | string[];
  type?: string;
}

export interface ResolverOptions {
  /** Whether a package.json's redirecting fields (`exports`, `imports`, `browser`)
   *  count. The hosted profile ignores them for the deck's own package.json, which
   *  the deck's author writes: only packages from the trusted list may redirect. */
  redirects?: (pkgDir: string) => boolean;
}

export class Resolver {
  private pkgCache = new Map<string, PkgJson | null>();

  constructor(
    private files: Files,
    private opts: ResolverOptions = {},
  ) {}

  readPkg(dir: string): PkgJson | null {
    const p = join(dir, "package.json");
    if (this.pkgCache.has(p)) return this.pkgCache.get(p)!;
    let pkg: PkgJson | null = null;
    if (this.files.stat(p) === "file") {
      try {
        pkg = JSON.parse(readText(this.files, p) ?? "null") as PkgJson;
      } catch {
        pkg = null;
      }
    }
    if (pkg && this.opts.redirects && !this.opts.redirects(dir)) {
      const { exports: _e, imports: _i, browser: _b, ...rest } = pkg;
      pkg = rest;
    }
    this.pkgCache.set(p, pkg);
    return pkg;
  }

  /** The directory of the package.json that owns `file` (nearest one up). */
  packageDirOf(file: string): string | null {
    for (let d = dirname(file); ; d = dirname(d)) {
      if (this.readPkg(d)) return d;
      if (d === "/") return null;
    }
  }

  /** Whether esbuild may drop `file` when nothing it exports is used. */
  hasSideEffects(file: string): boolean {
    const dir = this.packageDirOf(file);
    if (!dir) return true;
    const se = this.readPkg(dir)!.sideEffects;
    if (se === false) return false;
    if (Array.isArray(se)) {
      const rel = file.slice(dir.length + 1);
      return se.some((glob) => globToRegExp(glob.replace(/^\.\//, "")).test(rel) || globToRegExp(glob).test(file.slice(dir.length + 1)));
    }
    return true;
  }

  resolve(spec: string, fromDir: string, opts: ResolveOptions = JS_RESOLVE): Resolved | null {
    if (spec.startsWith("/") || spec.startsWith("./") || spec.startsWith("../") || spec === "." || spec === "..") {
      const target = this.applyBrowserMap(normalize(join(fromDir, spec)), fromDir);
      if (target && "empty" in target) return target;
      const file = this.tryFile(target ? target.path : join(fromDir, spec), opts);
      return file ? { path: this.files.realpath(file) } : null;
    }
    if (spec.startsWith("#")) return this.resolveImports(spec, fromDir, opts);
    return this.resolveBare(spec, fromDir, opts);
  }

  /** A relative path that a package's `browser` map redirects (or empties). */
  private applyBrowserMap(abs: string, fromDir: string): Resolved | null {
    const dir = this.packageDirOf(abs) ?? this.packageDirOf(join(fromDir, "x"));
    if (!dir) return null;
    const browser = this.readPkg(dir)?.browser;
    if (!browser || typeof browser === "string") return null;
    const file = this.tryFile(abs, JS_RESOLVE) ?? abs;
    for (const [from, to] of Object.entries(browser)) {
      if (!from.startsWith(".")) continue;
      if ((this.tryFile(join(dir, from), JS_RESOLVE) ?? join(dir, from)) !== file) continue;
      if (to === false) return { empty: true };
      return { path: join(dir, to) };
    }
    return null;
  }

  private resolveImports(spec: string, fromDir: string, opts: ResolveOptions): Resolved | null {
    const dir = this.packageDirOf(join(fromDir, "x"));
    if (!dir) return null;
    const target = resolveExportsMap(this.readPkg(dir)?.imports, spec, opts.conditions);
    if (!target) return null;
    if (!target.startsWith("./")) return this.resolveBare(target, dir, opts);
    const file = this.tryFile(join(dir, target), opts);
    return file ? { path: this.files.realpath(file) } : null;
  }

  private resolveBare(spec: string, fromDir: string, opts: ResolveOptions): Resolved | null {
    const parts = spec.split("/");
    const name = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
    const sub = spec.slice(name.length); // "" or "/x/y"

    // The importing package's `browser` map can redirect or empty a bare module.
    const ownDir = this.packageDirOf(join(fromDir, "x"));
    const ownBrowser = ownDir ? this.readPkg(ownDir)?.browser : undefined;
    if (ownBrowser && typeof ownBrowser === "object" && spec in ownBrowser) {
      const to = ownBrowser[spec];
      if (to === false) return { empty: true };
      if (typeof to === "string") return this.resolve(to.startsWith(".") ? to : to, ownDir!, opts);
    }

    for (let d = fromDir; ; d = dirname(d)) {
      if (!d.endsWith("/node_modules")) {
        const pkgDir = join(d, "node_modules", name);
        if (this.files.stat(pkgDir) === "dir") {
          const real = this.files.realpath(pkgDir);
          const found = this.resolveInPackage(real, sub, opts);
          if (found) return found;
        }
      }
      if (d === "/") return null;
    }
  }

  private resolveInPackage(pkgDir: string, sub: string, opts: ResolveOptions): Resolved | null {
    const pkg = this.readPkg(pkgDir);
    if (pkg?.exports !== undefined && pkg.exports !== null) {
      const target = resolveExportsMap(pkg.exports, "." + sub, opts.conditions);
      if (!target) return null;
      const file = join(pkgDir, target);
      if (this.files.stat(file) === "file") return { path: this.files.realpath(file) };
      // Extension-less export targets are not allowed by Node, but be lenient.
      const probed = this.tryFile(file, opts);
      return probed ? { path: this.files.realpath(probed) } : null;
    }
    if (sub) {
      const redirected = this.applyBrowserMap(join(pkgDir, "." + sub), pkgDir);
      if (redirected) return "empty" in redirected ? redirected : this.fileResolved(redirected.path, opts);
      return this.fileResolved(join(pkgDir, "." + sub), opts);
    }
    const mains: string[] = [];
    if (opts === CSS_RESOLVE || opts.conditions.includes("style")) mains.push("index.css");
    if (typeof pkg?.browser === "string") mains.push(pkg.browser);
    if (pkg?.module) mains.push(pkg.module);
    if (pkg?.main) mains.push(pkg.main);
    mains.push("index");
    for (const m of mains) {
      const abs = join(pkgDir, m);
      const redirected = this.applyBrowserMap(abs, pkgDir);
      if (redirected && "empty" in redirected) return redirected;
      const file = this.tryFile(redirected ? redirected.path : abs, opts);
      if (file) return { path: this.files.realpath(file) };
    }
    return null;
  }

  private fileResolved(abs: string, opts: ResolveOptions): Resolved | null {
    const file = this.tryFile(abs, opts);
    return file ? { path: this.files.realpath(file) } : null;
  }

  /** The file a path names, probing extensions and directory indexes; null when none. */
  tryFile(abs: string, opts: ResolveOptions): string | null {
    const s = this.files.stat(abs);
    if (s === "file") return abs;
    for (const ext of opts.extensions) if (this.files.stat(abs + ext) === "file") return abs + ext;
    // TypeScript lets source import "./x.js" for "./x.ts".
    const m = /\.(m?js|jsx)$/.exec(abs);
    if (m) {
      const stem = abs.slice(0, -m[0].length);
      for (const ext of [".ts", ".tsx", ".mts"]) if (this.files.stat(stem + ext) === "file") return stem + ext;
    }
    if (s === "dir") {
      const pkg = this.readPkg(abs);
      const main = pkg?.module ?? pkg?.main;
      if (main) {
        const f = this.tryFile(join(abs, main), opts);
        if (f) return f;
      }
      for (const ext of opts.extensions) if (this.files.stat(join(abs, "index" + ext)) === "file") return join(abs, "index" + ext);
    }
    return null;
  }
}

function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++;
      } else re += "[^/]*";
    } else if ("\\^$+?.()|{}[]".includes(c)) re += "\\" + c;
    else re += c;
  }
  // A pattern without a slash matches the base name anywhere (webpack semantics).
  return glob.includes("/") ? new RegExp("^" + re + "$") : new RegExp("(^|/)" + re + "$");
}

/** Resolve a subpath ("." or "./x") or an import ("#x") against an exports or
 *  imports map, following conditions in the order the map lists them. */
export function resolveExportsMap(map: unknown, subpath: string, conditions: string[]): string | null {
  if (map === undefined || map === null) return null;
  // Sugar: a string, an array, or a conditions object stand for { ".": map }.
  const isSubpathMap = typeof map === "object" && !Array.isArray(map) && Object.keys(map as object).some((k) => k.startsWith(".") || k.startsWith("#"));
  const table: Record<string, unknown> = isSubpathMap ? (map as Record<string, unknown>) : { ".": map };
  if (subpath in table && !subpath.includes("*")) return resolveTarget(table[subpath], conditions, "");
  // Patterns: the longest matching prefix wins.
  let best: { key: string; star: string } | null = null;
  for (const key of Object.keys(table)) {
    const star = key.indexOf("*");
    if (star < 0) {
      if (key.endsWith("/") && subpath.startsWith(key) && (!best || key.length > best.key.length)) best = { key, star: subpath.slice(key.length) };
      continue;
    }
    const prefix = key.slice(0, star);
    const suffix = key.slice(star + 1);
    if (subpath.startsWith(prefix) && subpath.endsWith(suffix) && subpath.length >= key.length - 1) {
      if (!best || prefix.length > best.key.indexOf("*")) best = { key, star: subpath.slice(prefix.length, subpath.length - suffix.length) };
    }
  }
  if (!best) return null;
  const target = resolveTarget(table[best.key], conditions, best.star);
  if (target && best.key.endsWith("/") && !best.key.includes("*")) return target + best.star;
  return target;
}

function resolveTarget(target: unknown, conditions: string[], star: string): string | null {
  if (target === null || target === undefined) return null;
  if (typeof target === "string") return target.replaceAll("*", star);
  if (Array.isArray(target)) {
    for (const t of target) {
      const r = resolveTarget(t, conditions, star);
      if (r) return r;
    }
    return null;
  }
  if (typeof target === "object") {
    for (const [cond, value] of Object.entries(target as Record<string, unknown>)) {
      if (cond === "default" || conditions.includes(cond)) {
        const r = resolveTarget(value, conditions, star);
        if (r) return r;
      }
    }
  }
  return null;
}
