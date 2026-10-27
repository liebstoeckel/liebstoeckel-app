// `new URL("./logo.svg", import.meta.url)` in a deck's own code. Bundlers that copy
// files next to their output read this as a reference to a file; a deck has nowhere
// to put one. The build is a single self-contained file, the dev server serves only
// what the module graph resolved, and the browser preview runs each module from a
// blob URL, which cannot be the base of another URL. So in deck code it is a build
// error that says what to do instead. Packages keep the pattern: what they do with
// it is theirs.
import type { Esbuild } from "./esbuild.ts";
import { readText } from "./files.ts";
import type { LoadContext, LoadResult } from "./load.ts";
import { skipLiteral } from "./refresh.ts";

export const IMPORT_META_URL_PROBLEM =
  "new URL(..., import.meta.url) does not work in a deck: the deck builds into one self-contained file, with no folder next to its modules. " +
  'Import the file instead (import logo from "./logo.svg") and use the URL the import gives you.';

/** What `import.meta.url` becomes for the check: an identifier, so esbuild puts it
 *  only where the code reads `import.meta.url`, never into a string or a comment. */
const MARKER = "__lst_import_meta_url__";
const CODE = new Set(["js", "jsx", "ts", "tsx"]);

interface Call {
  /** where `new` starts */
  at: number;
  /** the text between the parentheses */
  args: string;
}

/** The index of the parenthesis that closes the one at `open`, or -1. */
function matchParen(src: string, open: number): number {
  let depth = 0;
  let prev = "";
  for (let i = open; i < src.length; ) {
    const skipped = skipLiteral(src, i, prev);
    if (skipped >= 0) {
      i = skipped;
      prev = "a";
      continue;
    }
    const c = src[i]!;
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return i;
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return -1;
}

const NEW_URL = /new\s+URL\s*\(/y;

/** Every `new URL(...)` call in the code, outside strings, templates and comments. */
export function newUrlCalls(src: string): Call[] {
  const calls: Call[] = [];
  let prev = "";
  for (let i = 0; i < src.length; ) {
    const skipped = skipLiteral(src, i, prev);
    if (skipped >= 0) {
      i = skipped;
      prev = "a";
      continue;
    }
    if (src[i] === "n" && !/[\w$.]/.test(src[i - 1] ?? "")) {
      NEW_URL.lastIndex = i;
      const m = NEW_URL.exec(src);
      if (m) {
        const open = i + m[0].length - 1;
        const close = matchParen(src, open);
        if (close > 0) calls.push({ at: i, args: src.slice(open + 1, close) });
      }
    }
    if (!/\s/.test(src[i]!)) prev = src[i]!;
    i++;
  }
  return calls;
}

/** How many `new URL(<x>, import.meta.url)` a module holds, as esbuild reads it, so
 *  a slide that only mentions the pattern (in a comment, a string, a code sample or
 *  JSX text) does not count. */
export async function importMetaUrlBases(esbuild: Pick<Esbuild, "transform">, code: string, loader: string): Promise<number> {
  if (!CODE.has(loader) || !code.includes("import.meta.url")) return 0;
  let out: string;
  try {
    out = (await esbuild.transform(code, { loader: loader as "js", define: { "import.meta.url": MARKER }, jsx: "automatic", format: "esm", target: "esnext", logLevel: "silent" })).code;
  } catch {
    return 0; // a syntax error: the build reports it on its own
  }
  const last = new RegExp(`,\\s*${MARKER}\\s*$`);
  return newUrlCalls(out).filter((c) => last.test(c.args)).length;
}

/** Where such a call starts in the source (1-based line, 0-based column), when the
 *  source shows exactly the calls esbuild found; otherwise null, so the error names
 *  only the file rather than a wrong line. */
export function locateImportMetaUrlBase(source: string, count: number): { line: number; column: number } | null {
  const hits = newUrlCalls(source).filter((c) => /,\s*import\s*\.\s*meta\s*\.\s*url\s*$/.test(c.args));
  if (hits.length !== count || count === 0) return null;
  const before = source.slice(0, hits[0]!.at);
  const line = before.split("\n").length;
  return { line, column: hits[0]!.at - (before.lastIndexOf("\n") + 1) };
}

/** The deck's own code: under the deck's folder and not an installed package. */
export function isDeckCode(ctx: LoadContext, path: string): boolean {
  const deck = ctx.deck;
  return deck !== undefined && (path === deck || path.startsWith(deck + "/")) && !path.includes("/node_modules/");
}

/** The build error for a deck module that bases a URL on its own location, or null. */
export async function importMetaUrlError(ctx: LoadContext, esbuild: Pick<Esbuild, "transform">, path: string, loaded: LoadResult) {
  if (typeof loaded.contents !== "string" || !isDeckCode(ctx, path)) return null;
  const count = await importMetaUrlBases(esbuild, loaded.contents, loaded.loader);
  if (count === 0) return null;
  const at = locateImportMetaUrlBase(readText(ctx.files, path) ?? "", count);
  return { text: IMPORT_META_URL_PROBLEM, location: { file: path, ...(at ?? {}) } };
}
