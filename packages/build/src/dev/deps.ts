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
import { readText } from "../core/files.ts";
import { extractCandidates, newLoadContext } from "../core/load.ts";
import { NS, vfsPlugin } from "../core/plugin.ts";
import { JS_RESOLVE, Resolver } from "../core/resolve.ts";
import { esbuild } from "../esbuild-native.ts";
import type { DeckTree } from "../profile.ts";

const FORMAT = 1;

interface CacheManifest extends DepsManifest {
  format: number;
  key: string;
  /** what the prebuild read, to tell whether the cache still holds */
  inputs: Array<{ path: string; size: number; mtimeMs: number }>;
}

export interface Prebuilt {
  manifest: DepsManifest;
  /** folder holding the built files */
  dir: string;
  ms: number;
  cached: boolean;
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
export const hasDefaultExport = (source: string) => /\bexport\s+default\b|\bexport\s*\{[^}]*?(?:\bas\s+default\s*[,}]|(?:\{|,)\s*default\s*[,}])/.test(source);

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

function keyOf(specs: string[], mode: string): string {
  return createHash("sha256").update(JSON.stringify({ FORMAT, specs, mode, esbuild: esbuild.version, build: BUILD_VERSION })).digest("hex").slice(0, 16);
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
export async function prebuildDeps(tree: DeckTree, specs: string[], cacheDir: string, mode: "development" | "production" = "development"): Promise<Prebuilt> {
  const t0 = performance.now();
  const sorted = [...new Set(specs)].sort();
  const key = keyOf(sorted, mode);
  const dir = join(cacheDir, key);
  const manifestFile = join(dir, "manifest.json");
  if (existsSync(manifestFile)) {
    try {
      const m = JSON.parse(readFileSync(manifestFile, "utf8")) as CacheManifest;
      if (m.format === FORMAT && m.key === key && stillValid(tree, m)) {
        return { manifest: { imports: m.imports, css: m.css, candidates: m.candidates }, dir, ms: performance.now() - t0, cached: true };
      }
    } catch {
      // rebuild below
    }
  }
  if (sorted.length === 0) return { manifest: EMPTY_DEPS, dir, ms: 0, cached: false };

  const resolver = new Resolver(tree.files, tree.resolver);
  const ctx = newLoadContext(tree.files, resolver, mode);
  const candidates = new Set<string>();
  ctx.onSource = (_path, text) => extractCandidates(text, candidates);
  const entryCode = new Map<string, string>();
  for (const spec of sorted) {
    const resolved = resolver.resolve(spec, tree.deck, JS_RESOLVE);
    if (!resolved || !("path" in resolved)) {
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
    absWorkingDir: "/",
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
        },
      },
      vfsPlugin(ctx),
    ],
  });
  const imports: Record<string, string> = {};
  const css: string[] = [];
  for (const [outPath, meta] of Object.entries(result.metafile!.outputs)) {
    const rel = outPath.replace(/^\/?deps\//, "");
    if (meta.entryPoint?.startsWith("lst-dep:")) imports[meta.entryPoint.slice("lst-dep:".length)] = rel;
    if (meta.cssBundle) css.push(meta.cssBundle.replace(/^\/?deps\//, ""));
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
    const file = join(tmp, out.path.replace(/^\/?deps\//, ""));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, out.contents);
  }
  const manifest: CacheManifest = { format: FORMAT, key, imports, css: css.sort(), candidates: [...candidates].sort(), inputs };
  mkdirSync(tmp, { recursive: true });
  writeFileSync(join(tmp, "manifest.json"), JSON.stringify(manifest));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dirname(dir), { recursive: true });
  renameSync(tmp, dir);
  return { manifest: { imports, css: manifest.css, candidates: manifest.candidates }, dir, ms: performance.now() - t0, cached: false };
}
