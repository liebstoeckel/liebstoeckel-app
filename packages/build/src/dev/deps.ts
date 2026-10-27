// The dependency prebuild for the dev server: everything a deck module imports by
// a bare specifier (React, Motion, the framework packages, ...) built once with
// esbuild as ES modules with shared chunks, named by content hash, and served
// through an import map. Vite calls this dependency pre-bundling. The result is
// cached on disk, keyed by the specifiers and the tool versions, and reused while
// every file it was built from is unchanged (size and modification time).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DepsManifest } from "../core/dev.ts";
import { ESBUILD_ROOT, outputRelative } from "../core/build.ts";
import { readText } from "../core/files.ts";
import { extractCandidates, newLoadContext } from "../core/load.ts";
import { NS, resolveInjected, vfsPlugin } from "../core/plugin.ts";
import { JS_RESOLVE, Resolver } from "../core/resolve.ts";
import { esbuild } from "../esbuild-native.ts";
import type { DeckTree } from "../profile.ts";

const FORMAT = 1;

interface CacheManifest extends DepsManifest {
  format: number;
  key: string;
  /** what the prebuild read, to tell whether the cache still holds */
  inputs: Array<{ path: string; size: number; mtimeMs: number }>;
  /** specifiers that did not resolve: the cache stops holding once one does */
  unresolved?: string[];
}

export interface Prebuilt {
  manifest: DepsManifest;
  /** folder holding the built files */
  dir: string;
  ms: number;
  cached: boolean;
  /** bare specifiers the deck imports that nothing installed provides */
  unresolved: string[];
}

export const EMPTY_DEPS: DepsManifest = { imports: {}, css: [], candidates: [] };

const BUILD_VERSION = (() => {
  try {
    return (JSON.parse(readFileSync(join(import.meta.dir, "../../package.json"), "utf8")) as { version?: string }).version ?? "0";
  } catch {
    return "0";
  }
})();

const outName = (spec: string) => spec.replace(/^@/, "").replace(/[^\w.-]+/g, "_");

function isCommonJs(source: string): boolean {
  return /\bmodule\.exports\b|\bexports\.[\w$]+\s*=|\bObject\.defineProperty\(\s*exports\b/.test(source) && !/^\s*export\s/m.test(source) && !/^\s*import\s[\w*{]/m.test(source);
}

/** Whether an ES module exports `default` itself: `export default`, `export { x as
 *  default }` or `export { default } from` (not `export { default as X }`). */
export function hasDefaultExport(source: string): boolean {
  if (/\bexport\s+default\b/.test(source)) return true;
  // `export { default } from`, `export { x as default }`; not `export { default as x }`,
  // and nothing type-only.
  for (const m of source.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
    for (const raw of m[1]!.split(",")) {
      const part = raw.trim();
      if (part.startsWith("type ")) continue;
      if (part === "default" || /\bas\s+default$/.test(part)) return true;
    }
  }
  return false;
}

/** The names a CommonJS module exports, read statically (nothing runs): `exports.x =`,
 *  `Object.defineProperty(exports, "x"`, `module.exports = { x, y: ... }`, and the
 *  modules `module.exports = require("...")` hands on. */
export function cjsExports(tree: DeckTree, resolver: Resolver, path: string, seen = new Set<string>()): Set<string> {
  const names = new Set<string>();
  if (seen.has(path) || seen.size > 50) return names;
  seen.add(path);
  const src = readText(tree.files, path) ?? "";
  for (const m of src.matchAll(/(?:^|[^.\w$])(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=[^=]/g)) names.add(m[1]!);
  for (const m of src.matchAll(/Object\.defineProperty\(\s*(?:module\.)?exports\s*,\s*["']([A-Za-z_$][\w$]*)["']/g)) names.add(m[1]!);
  for (const m of src.matchAll(/module\.exports\s*=\s*\{([^}]*)\}/g)) {
    for (const part of m[1]!.split(",")) {
      const key = /^\s*([A-Za-z_$][\w$]*)\s*(?::|$)/.exec(part);
      if (key) names.add(key[1]!);
    }
  }
  for (const m of src.matchAll(/module\.exports\s*=\s*require\(\s*["']([^"']+)["']\s*\)/g)) {
    const r = resolver.resolve(m[1]!, dirname(path), JS_RESOLVE);
    if (r && "path" in r) for (const n of cjsExports(tree, resolver, r.path, seen)) names.add(n);
  }
  names.delete("__esModule");
  names.delete("default");
  return names;
}

function keyOf(specs: string[], mode: string, external: string[]): string {
  const key: Record<string, unknown> = { FORMAT, specs, mode, esbuild: esbuild.version, build: BUILD_VERSION };
  if (external.length) key.external = external;
  return createHash("sha256").update(JSON.stringify(key)).digest("hex").slice(0, 16);
}

export interface PrebuildOptions {
  /** Bare specifiers left as they are, for an import map that another prebuild
   *  fills: a second set of dependencies that imports `react` then uses the page's
   *  React instead of bundling a copy of its own. Exact specifiers, not patterns. */
  external?: readonly string[];
}

function stillValid(tree: DeckTree, m: CacheManifest): boolean {
  for (const i of m.inputs) {
    try {
      const s = statSync(tree.disk.real(i.path));
      if (s.size !== i.size || s.mtimeMs !== i.mtimeMs) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/** Prebuild (or load from the cache) the dependencies for a set of bare specifiers
 *  a deck imports. Reads through the tree's Files, so the hosted gate holds here too. */
export async function prebuildDeps(
  tree: DeckTree,
  specs: string[],
  cacheDir: string,
  mode: "development" | "production" = "development",
  options: PrebuildOptions = {},
): Promise<Prebuilt> {
  const t0 = performance.now();
  const sorted = [...new Set(specs)].sort();
  const entries = new Set(sorted);
  // A specifier prebuilt here is never also left to someone else's import map.
  const external = [...new Set(options.external ?? [])].filter((s) => !entries.has(s)).sort();
  const externals = new Set(external);
  const key = keyOf(sorted, mode, external);
  const dir = join(cacheDir, key);
  const manifestFile = join(dir, "manifest.json");
  const resolver = new Resolver(tree.files, tree.resolver);
  const resolve = (spec: string) => resolver.resolve(spec, tree.deck, JS_RESOLVE) ?? resolveInjected(resolver, spec, tree.deck);
  const resolves = (spec: string) => {
    const r = resolve(spec);
    return !!r && "path" in r;
  };
  if (existsSync(manifestFile)) {
    try {
      const m = JSON.parse(readFileSync(manifestFile, "utf8")) as CacheManifest;
      // A package installed since (`liebstoeckel install` while dev runs) ends the cache.
      const unresolved = m.unresolved ?? [];
      if (m.format === FORMAT && m.key === key && stillValid(tree, m) && !unresolved.some(resolves)) {
        return { manifest: { imports: m.imports, css: m.css, candidates: m.candidates }, dir, ms: performance.now() - t0, cached: true, unresolved };
      }
    } catch {
      // rebuild below
    }
  }
  if (sorted.length === 0) return { manifest: EMPTY_DEPS, dir, ms: 0, cached: false, unresolved: [] };

  const unresolved: string[] = [];
  const ctx = newLoadContext(tree.files, resolver, mode);
  const candidates = new Set<string>();
  ctx.onSource = (_path, text) => extractCandidates(text, candidates);
  const entryCode = new Map<string, string>();
  for (const spec of sorted) {
    const resolved = resolve(spec);
    if (!resolved || !("path" in resolved)) {
      unresolved.push(spec);
      entryCode.set(spec, `throw new Error(${JSON.stringify(`Could not resolve "${spec}" from the deck`)});\n`);
      continue;
    }
    const source = readText(tree.files, resolved.path) ?? "";
    if (isCommonJs(source)) {
      // esbuild turns a CommonJS entry into a default export only; name the exports.
      const names = [...cjsExports(tree, resolver, resolved.path)].filter((n) => /^[A-Za-z_$][\w$]*$/.test(n)).sort();
      entryCode.set(spec, `import __m from ${JSON.stringify(spec)};\nexport default __m;\n${names.length ? `export const { ${names.join(", ")} } = __m;\n` : ""}`);
    } else {
      entryCode.set(spec, `export * from ${JSON.stringify(spec)};\n${hasDefaultExport(source) ? `export { default } from ${JSON.stringify(spec)};\n` : ""}`);
    }
  }
  const result = await esbuild.build({
    entryPoints: sorted.map((s) => ({ in: `lst-dep:${s}`, out: outName(s) })),
    bundle: true,
    splitting: true,
    write: false,
    outdir: "/deps",
    absWorkingDir: ESBUILD_ROOT,
    format: "esm",
    platform: "browser",
    target: "esnext",
    minifyWhitespace: true,
    minifySyntax: true,
    charset: "utf8",
    legalComments: "none",
    entryNames: "[name]-[hash]",
    chunkNames: "chunks/[hash]",
    assetNames: "assets/[name]-[hash]",
    jsx: "automatic",
    jsxImportSource: "react",
    define: { "process.env.NODE_ENV": JSON.stringify(mode) },
    metafile: true,
    logLevel: "silent",
    plugins: [
      {
        name: "liebstoeckel-dep-entries",
        setup(build) {
          build.onResolve({ filter: /^lst-dep:/ }, (args) => ({ path: args.path.slice("lst-dep:".length), namespace: "lst-dep" }));
          build.onLoad({ filter: /.*/, namespace: "lst-dep" }, (args) => ({ contents: entryCode.get(args.path)!, loader: "js", resolveDir: tree.deck }));
          if (externals.size) build.onResolve({ filter: /^[^./]/ }, (args) => (externals.has(args.path) ? { path: args.path, external: true } : undefined));
        },
      },
      vfsPlugin(ctx),
    ],
  });
  const imports: Record<string, string> = {};
  const css: string[] = [];
  for (const [outPath, meta] of Object.entries(result.metafile!.outputs)) {
    const rel = outputRelative(outPath, "/deps");
    if (meta.entryPoint?.startsWith("lst-dep:")) imports[meta.entryPoint.slice("lst-dep:".length)] = rel;
    if (meta.cssBundle) css.push(outputRelative(meta.cssBundle, "/deps"));
  }
  const inputs = Object.keys(result.metafile!.inputs)
    .filter((k) => k.startsWith(`${NS}:`))
    .map((k) => k.slice(NS.length + 1))
    .sort()
    .map((path) => {
      const s = statSync(tree.disk.real(path));
      return { path, size: s.size, mtimeMs: s.mtimeMs };
    });
  // Write into a fresh folder and move it into place, so a reader never sees half a cache.
  const tmp = `${dir}.tmp-${process.pid}-${Date.now()}`;
  rmSync(tmp, { recursive: true, force: true });
  for (const out of result.outputFiles) {
    const file = join(tmp, outputRelative(out.path, "/deps"));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, out.contents);
  }
  const manifest: CacheManifest = { format: FORMAT, key, imports, css: css.sort(), candidates: [...candidates].sort(), inputs, ...(unresolved.length ? { unresolved } : {}) };
  mkdirSync(tmp, { recursive: true });
  writeFileSync(join(tmp, "manifest.json"), JSON.stringify(manifest));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dirname(dir), { recursive: true });
  renameSync(tmp, dir);
  return { manifest: { imports, css: manifest.css, candidates: manifest.candidates }, dir, ms: performance.now() - t0, cached: false, unresolved };
}

/** The line the dev server shows for packages the deck imports but has not installed. */
export function unresolvedProblem(specs: string[]): string | null {
  if (specs.length === 0) return null;
  const names = specs.map((s) => `"${s}"`).join(", ");
  return `Could not resolve ${names} from the deck: install the deck's dependencies with \`liebstoeckel install\` (the dev server picks them up without a restart)`;
}
