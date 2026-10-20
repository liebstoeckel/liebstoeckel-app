// Tailwind v4 through its pure-JS compiler (the same one @tailwindcss/browser
// uses), so CSS generation runs in the browser too. Candidates come from the
// module graph's sources with a small extractor instead of the native oxide
// scanner: it over-collects (any word could be a class), which Tailwind tolerates
// by ignoring what is not a utility.
import { compile } from "tailwindcss";
import { readText, type Files } from "./files.ts";
import { dirname, join, relative } from "./path.ts";
import { CSS_RESOLVE, type Resolver } from "./resolve.ts";

/** A CSS file is a Tailwind root when it imports Tailwind itself. */
export function isTailwindRoot(css: string): boolean {
  return /@import\s+["']tailwindcss["']/.test(css);
}

const SPLIT = /[\s"'`{};\\]+/;
const TRIM = /^[,(<>=]+|[,)<>=]+$/g;

/** Every token that could be a class name, sorted for a deterministic build. */
export function extractCandidates(source: string, into: Set<string> = new Set()): Set<string> {
  for (const raw of source.split(SPLIT)) {
    if (!raw || raw.length > 120) continue;
    into.add(raw);
    const trimmed = raw.replace(TRIM, "");
    if (trimmed && trimmed !== raw) into.add(trimmed);
    // `className=x` and `class:x` forms
    const eq = trimmed.lastIndexOf("=");
    if (eq >= 0 && eq < trimmed.length - 1) into.add(trimmed.slice(eq + 1));
  }
  return into;
}

/** Tailwind inlines imported stylesheets into the root, where a relative `url()`
 *  would then resolve against the root's folder instead of its own. Point every
 *  relative url() that names an existing file at it from the root's folder. Bare
 *  ones (`url("@fontsource/x/files/a.woff2")`, a package path) stay as written. */
export function rebaseUrls(files: Files, css: string, fromDir: string, rootDir: string): string {
  if (fromDir === rootDir) return css;
  return css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (m, q: string, raw: string) => {
    if (/^(data:|https?:|\/\/|#|\/)/i.test(raw)) return m;
    const target = join(fromDir, raw.split(/[?#]/)[0]!);
    if (files.stat(target) !== "file") return m;
    const rel = relative(rootDir, target) + raw.slice(raw.split(/[?#]/)[0]!.length);
    return `url(${q}${rel}${q})`;
  });
}

export interface TailwindRoot {
  /** Generate the stylesheet for a set of candidates (fast; the compiler is reused). */
  build(candidates: Iterable<string>): string;
  /** Every stylesheet the root pulled in, for change tracking. */
  dependencies: string[];
}

/** Compile a Tailwind root stylesheet once; `build` can then run per edit. */
export async function compileTailwindRoot(files: Files, resolver: Resolver, path: string, css: string): Promise<TailwindRoot> {
  const dependencies = [path];
  const compiler = await compile(css, {
    base: dirname(path),
    from: path,
    loadStylesheet: async (id, base) => {
      const resolved = resolver.resolve(id, base, CSS_RESOLVE);
      if (!resolved || "empty" in resolved) throw new Error(`tailwind: cannot resolve stylesheet ${id} from ${base}`);
      const content = readText(files, resolved.path);
      if (content === null) throw new Error(`tailwind: cannot read ${resolved.path}`);
      dependencies.push(resolved.path);
      return { path: resolved.path, base: dirname(resolved.path), content: rebaseUrls(files, content, dirname(resolved.path), dirname(path)) };
    },
    loadModule: async (id) => {
      throw new Error(
        `${path}: Tailwind's @plugin and @config load JavaScript at build time, which the build does not run (${id}). ` +
          `Write the plugin's utilities as CSS (@utility, @variant) in the stylesheet instead.`,
      );
    },
  });
  return {
    dependencies,
    build(candidates) {
      return compiler.build([...new Set(candidates)].sort());
    },
  };
}
