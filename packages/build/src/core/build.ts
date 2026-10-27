// The production build: a deck's index.html to one self-contained HTML string.
// Two esbuild passes over the same load pipeline: the first walks the module
// graph to collect Tailwind candidates (CSS roots load empty), the second bundles
// for real with the stylesheet generated from them. The expensive load steps (MDX,
// the code step) are memoized, so the second pass only re-runs esbuild itself.
import type { Esbuild } from "./esbuild.ts";
import type { Files } from "./files.ts";
import { readText } from "./files.ts";
import { htmlEntries, inlineHtml } from "./html.ts";
import { newLoadContext, extractCandidates, type LoadContext, type Notice } from "./load.ts";
import { dirname, join } from "./path.ts";
import { NS, vfsPlugin } from "./plugin.ts";
import { Resolver, type ResolverOptions } from "./resolve.ts";

export interface DeckBuildOptions {
  files: Files;
  esbuild: Esbuild;
  /** virtual path of the deck's index.html */
  html: string;
  minify?: boolean;
  /** Resolver settings (the hosted profile's redirect rule). */
  resolver?: ResolverOptions;
}

/** One problem esbuild or a load step reported, with its place when known. */
export interface BuildMessage {
  text: string;
  /** virtual path */
  file?: string;
  /** 1-based */
  line?: number;
  /** 1-based */
  column?: number;
}

export class DeckBuildError extends Error {
  constructor(public readonly messages: BuildMessage[]) {
    super(messages.map(formatMessage).join("\n") || "the deck build failed");
  }
}

export function formatMessage(m: BuildMessage): string {
  const where = m.file ? `${m.file}${m.line ? `:${m.line}${m.column ? `:${m.column}` : ""}` : ""}: ` : "";
  return `${where}${m.text}`;
}

export interface DeckBuildResult {
  html: string;
  js: string;
  css: string;
  /** every module the bundle loaded (virtual paths) */
  inputs: string[];
  warnings: BuildMessage[];
  notices: Notice[];
  timings: { scanMs: number; bundleMs: number; totalMs: number };
}

interface EsbuildMessage {
  text: string;
  location?: { file?: string; line?: number; column?: number } | null;
}

/** esbuild's messages in our shape; virtual paths without the namespace prefix. */
export function toMessages(list: EsbuildMessage[] | undefined): BuildMessage[] {
  return (list ?? []).map((m) => {
    const loc = m.location ?? undefined;
    // A virtual path, always absolute: esbuild prints a location a plugin gave it
    // relative to its working directory (`slides/a.tsx`, `slides\\a.tsx` on Windows).
    const bare = loc?.file ? loc.file.replace(new RegExp(`^${NS}:`), "").replace(/\\/g, "/") : undefined;
    const file = bare ? (bare.startsWith("/") ? bare : "/" + bare) : undefined;
    return {
      text: m.text,
      ...(file ? { file } : {}),
      ...(loc?.line ? { line: loc.line } : {}),
      ...(loc?.line && typeof loc.column === "number" ? { column: loc.column + 1 } : {}),
    };
  });
}

/** Run esbuild and turn a failure into a DeckBuildError with every message. */
async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const errors = (err as { errors?: EsbuildMessage[] }).errors;
    if (Array.isArray(errors)) throw new DeckBuildError(toMessages(errors));
    throw err;
  }
}

const now = () => performance.now();

/** esbuild's working directory. Every file is read through the virtual tree, so
 *  this only has to be an absolute path to esbuild: `/` everywhere but on
 *  Windows, where native esbuild only takes a path with a drive. Output paths
 *  (`/out`, `/deps`) are resolved against it, so they start with `C:\` there. */
export const ESBUILD_ROOT = (globalThis as { process?: { platform?: string } }).process?.platform === "win32" ? "C:\\" : "/";

/** An esbuild output path relative to its output directory (`/deps/a.js` or
 *  `C:\deps\a.js` -> `a.js`), the same on every platform. */
export function outputRelative(path: string, outdir: string): string {
  // Metafile paths are relative to the working directory (`deps/a.js`), output
  // files absolute (`/deps/a.js`, `C:\\deps\\a.js`): bring both to `/deps/a.js`.
  const p = "/" + path.replace(/\\/g, "/").replace(/^[A-Za-z]:/, "").replace(/^\/+/, "");
  const prefix = "/" + outdir.replace(/^\/+/, "").replace(/\/+$/, "") + "/";
  return p.startsWith(prefix) ? p.slice(prefix.length) : p.slice(1);
}

/** The options both passes share, and the dev transform reuses where it can. */
export function commonOptions(mode: "production" | "development") {
  return {
    bundle: true,
    write: false,
    absWorkingDir: ESBUILD_ROOT,
    format: "esm" as const,
    platform: "browser" as const,
    target: "esnext",
    charset: "utf8" as const,
    legalComments: "none" as const,
    jsx: "automatic" as const,
    jsxImportSource: "react",
    define: { "process.env.NODE_ENV": JSON.stringify(mode) },
    logLevel: "silent" as const,
  };
}

export async function buildDeck(opts: DeckBuildOptions): Promise<DeckBuildResult> {
  const t0 = now();
  const htmlText = readText(opts.files, opts.html);
  if (htmlText === null) throw new DeckBuildError([{ text: `no ${opts.html}` }]);
  const entries = htmlEntries(htmlText);
  if (entries.scripts.length === 0) throw new DeckBuildError([{ text: `${opts.html} has no <script type="module" src>`, file: opts.html }]);
  const deckDir = dirname(opts.html);
  const entryPoints = [...entries.scripts, ...entries.styles].map((src) => join(deckDir, src));

  const resolver = new Resolver(opts.files, opts.resolver);
  const ctx: LoadContext = newLoadContext(opts.files, resolver, "production");
  ctx.deck = deckDir;
  const sources = new Map<string, string>();
  const notices = new Map<string, Notice>();
  ctx.onSource = (path, text) => sources.set(path, text);
  ctx.onNotice = (n) => notices.set(`${n.file}\0${n.message}`, n);

  const common = { ...commonOptions("production"), entryPoints, outdir: "/out" };

  // Pass 1: the module graph, for Tailwind's candidates.
  await run(() => opts.esbuild.build({ ...common, minify: false, plugins: [vfsPlugin(ctx)] }));
  const t1 = now();
  const candidates = new Set<string>();
  for (const path of [...sources.keys()].sort()) extractCandidates(sources.get(path)!, candidates);

  // Pass 2: the real bundle.
  ctx.candidates = () => candidates;
  const result = await run(() =>
    opts.esbuild.build({
      ...common,
      minify: opts.minify ?? true,
      metafile: true,
      plugins: [vfsPlugin(ctx)],
    }),
  );
  const t2 = now();
  let js = "";
  let css = "";
  for (const out of result.outputFiles ?? []) {
    if (out.path.endsWith(".js")) js += out.text;
    else if (out.path.endsWith(".css")) css += out.text;
  }
  const inputs = Object.keys(result.metafile?.inputs ?? {})
    .filter((k) => k.startsWith(`${NS}:`))
    .map((k) => k.slice(NS.length + 1))
    .sort();
  const html = inlineHtml(htmlText, js.trimEnd(), css.trimEnd());
  return {
    html,
    js,
    css,
    inputs,
    warnings: toMessages(result.warnings),
    notices: [...notices.values()],
    timings: { scanMs: t1 - t0, bundleMs: t2 - t1, totalMs: now() - t0 },
  };
}
