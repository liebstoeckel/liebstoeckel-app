// The load pipeline every module goes through, in the production build and the dev
// server alike: read through the Files seam, then MDX, code files, the code step,
// Tailwind roots and the `import.meta.hot` stand-in. Pure TypeScript.
import { readText, type Files } from "./files.ts";
import type { Loader } from "./esbuild.ts";
import { CODE_FILE, compileCodeFile } from "./code-file.ts";
import { expandMacros, hasMacroImport } from "./macro.ts";
import { compileMdx } from "./mdx.ts";
import { extname } from "./path.ts";
import { compileTailwindRoot, extractCandidates, isTailwindRoot, type TailwindRoot } from "./tailwind.ts";
import type { Resolver } from "./resolve.ts";

export type Mode = "production" | "development";

const LOADERS: Record<string, Loader> = {
  ".ts": "ts",
  ".mts": "ts",
  ".cts": "ts",
  ".tsx": "tsx",
  ".js": "js",
  ".mjs": "js",
  ".cjs": "js",
  ".jsx": "jsx",
  ".json": "json",
  ".css": "css",
  ".mdx": "js",
  ".txt": "text",
};

const ASSETS = new Set([
  ".woff2",
  ".woff",
  ".ttf",
  ".otf",
  ".eot",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".ico",
  ".bmp",
  ".svg",
  ".mp4",
  ".webm",
  ".mov",
  ".mp3",
  ".wav",
  ".ogg",
  ".m4a",
  ".pdf",
]);

export function isAsset(path: string): boolean {
  return ASSETS.has(extname(path).toLowerCase());
}

export function isCodeFile(path: string): boolean {
  return CODE_FILE.test(path);
}

export interface LoadResult {
  contents: string | Uint8Array;
  loader: Loader;
}

/** Something the build wants the author to know (a deprecation, say), once per file. */
export interface Notice {
  file: string;
  message: string;
}

export interface LoadContext {
  files: Files;
  resolver: Resolver;
  mode: Mode;
  /** The deck's folder (virtual path): its files outside node_modules are the deck's own code. */
  deck?: string;
  /** Candidates for Tailwind roots. Undefined while scanning: roots then load empty. */
  candidates?: () => Iterable<string>;
  /** Called with every source text (after MDX), for candidate collection. */
  onSource?: (path: string, text: string) => void;
  /** Called with notices for the author (deduplicated by the caller). */
  onNotice?: (notice: Notice) => void;
  /** Compiled Tailwind roots, reused across builds and edits. */
  tailwindRoots: Map<string, Promise<TailwindRoot>>;
  /** Per-path results of the expensive steps (MDX, macros), keyed by content. */
  memo: Map<string, { text: string; out: Promise<string> }>;
}

export function newLoadContext(files: Files, resolver: Resolver, mode: Mode): LoadContext {
  return { files, resolver, mode, tailwindRoots: new Map(), memo: new Map() };
}

function memoized(ctx: LoadContext, key: string, text: string, run: () => Promise<string>): Promise<string> {
  const hit = ctx.memo.get(key);
  if (hit && hit.text === text) return hit.out;
  const out = run();
  ctx.memo.set(key, { text, out });
  out.catch(() => {
    if (ctx.memo.get(key)?.out === out) ctx.memo.delete(key);
  });
  return out;
}

/** Built decks have no hot runtime; a small inert object stands in for
 *  `import.meta.hot`, so `import.meta.hot.data.root ??= createRoot(...)` and
 *  `accept()` still work and do nothing (Bun erased them; the effect is the same).
 *  It is a hoisted function appended after the source, so every line keeps its
 *  number in the build's messages. */
export function shimHot(source: string): string {
  if (!source.includes("import.meta.hot")) return source;
  return (
    source.replaceAll("import.meta.hot", "__lstHot()") +
    "\nfunction __lstHot() { return (__lstHot.o ??= { data: {}, accept() {}, dispose() {}, decline() {}, invalidate() {}, on() {}, off() {} }); }\n"
  );
}

export const CODE_STORY_NOTICE =
  "uses the codeStory macro, which still builds but is deprecated: move the code states into a .code.md file " +
  '(one fenced block per state) and import it, e.g. import steps from "./greet.code.md"';

export async function loadModule(ctx: LoadContext, path: string): Promise<LoadResult | null> {
  const ext = extname(path).toLowerCase();
  if (isAsset(path)) {
    const bytes = ctx.files.read(path);
    return bytes ? { contents: bytes, loader: "dataurl" } : null;
  }
  const text = readText(ctx.files, path);
  if (text === null) return null;

  if (isCodeFile(path)) {
    const js = await memoized(ctx, "code:" + path, text, () => compileCodeFile(text, path));
    return { contents: js, loader: "js" };
  }

  const loader = LOADERS[ext];
  if (!loader) return { contents: text, loader: "text" };

  if (ext === ".mdx") {
    const js = await memoized(ctx, "mdx:" + path, text, () => compileMdx(text));
    ctx.onSource?.(path, js);
    return { contents: js, loader: "js" };
  }

  if (ext === ".css") {
    if (!isTailwindRoot(text)) return { contents: text, loader: "css" };
    if (!ctx.candidates) return { contents: "", loader: "css" };
    let root = ctx.tailwindRoots.get(path);
    if (!root) {
      root = compileTailwindRoot(ctx.files, ctx.resolver, path, text);
      ctx.tailwindRoots.set(path, root);
      root.catch(() => {
        if (ctx.tailwindRoots.get(path) === root) ctx.tailwindRoots.delete(path);
      });
    }
    return { contents: (await root).build(ctx.candidates()), loader: "css" };
  }

  let out = text;
  if (loader !== "json" && loader !== "text" && hasMacroImport(out)) {
    out = await memoized(ctx, "macro:" + path, text, () => expandMacros(text, path));
    ctx.onNotice?.({ file: path, message: CODE_STORY_NOTICE });
  }
  if (ctx.mode === "production" && loader !== "json" && loader !== "text" && !path.includes("/node_modules/")) out = shimHot(out);
  ctx.onSource?.(path, out);
  return { contents: out, loader };
}

export { extractCandidates };
