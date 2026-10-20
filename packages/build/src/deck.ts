// A deck's build on the host: the core's single HTML file plus everything a built
// deck carries besides its code (the plugin manifest with server bundles, the
// third-party license notices, the embedded source package, the generator stamp),
// the single-copy guard and the author-facing warnings. Bun is the host here (it
// writes files, packs the source, reads package.json files); the bundling itself
// is the core's, on native esbuild.
import { mkdirSync, writeFileSync } from "node:fs";
import { isBuiltin } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { brandFontWarning } from "@liebstoeckel/engine/build/font-audit";
import {
  buildReport,
  embedLicenses,
  firstPartyVersionConflicts,
  firstPartyVersions,
  formatFirstPartyConflicts,
  renderNotices,
  type LicenseReport,
} from "@liebstoeckel/engine/build/licenses";
import { deckLocalPlugins, discoverFromPackageJson, type PkgJson } from "@liebstoeckel/plugin-sdk/discovery";
import { embedManifest, encodeServerBundle, type PluginManifest, type PluginManifestEntry } from "@liebstoeckel/plugin-sdk/manifest";
import { buildDeck, DeckBuildError, ESBUILD_ROOT, formatMessage, toMessages, type BuildMessage, type DeckBuildResult } from "./core/build.ts";
import { newLoadContext } from "./core/load.ts";
import { vfsPlugin } from "./core/plugin.ts";
import { Resolver } from "./core/resolve.ts";
import { esbuild } from "./esbuild-native.ts";
import { bunfigProblems, deckTree, LOCAL, type DeckTree, type Profile } from "./profile.ts";
import { bundledEngineVersion, deckPluginWarnings, stampGenerator, type Generator } from "./stamp.ts";

export { DeckBuildError, type BuildMessage, type Generator };

/** Default first-party notice embedded alongside the third-party block, the
 *  MPL-2.0 line + public source pointer that MPL §3.2(b)/§3.4 require to travel
 *  with the inlined engine code. */
export const DEFAULT_SELF_NOTICE =
  "This presentation embeds the liebstoeckel presentation engine, licensed under\n" +
  "the Mozilla Public License 2.0. Source code for the covered files is available\n" +
  "at https://github.com/liebstoeckel/liebstoeckel, you may obtain it at no charge.";

export interface BundleOptions {
  /** The deck's index.html (default ./index.html, from the working directory). */
  entry?: string;
  outdir?: string;
  /** Final artifact name within `outdir` (default `index.html`). */
  outfile?: string;
  minify?: boolean;
  pkgJson?: string;
  /** Embed the deck's own source as a recoverable package so the .html is ejectable. */
  inlinePackage?: boolean;
  /** Embed a third-party notices block computed from the bundle's real module graph. */
  inlineLicenses?: boolean;
  /** First-party notice prepended to the notices block (default: the MPL line). */
  selfNotice?: string;
  /** Force the source embed past its secret gate (loud, explicit). */
  allowSecret?: boolean;
  /** The tool driving the build (e.g. the CLI), recorded in the generator stamp. */
  generator?: Generator;
  /** `local` (default) or `hosted` (the sandbox: a gate on every read). */
  profile?: Profile;
  /** Where progress lines and warnings go (default: the console). */
  log?: { info(line: string): void; warn(line: string): void };
}

export interface BundleResult {
  /** path of the written file */
  artifact: string;
  /** every module the bundle loaded (real paths) */
  inputs: string[];
  warnings: string[];
  timings: DeckBuildResult["timings"];
}

const consoleLog = { info: (l: string) => console.log(l), warn: (l: string) => console.warn(l) };

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return (await Bun.file(path).json()) as T;
  } catch {
    return null;
  }
}

/** Bundle a plugin's server entry into a self-contained, base64-encoded ESM module
 *  for the relay or live server (Bun), which injects `ctx`, so it rehydrates with
 *  no node_modules resolution. Built natively from the same files the deck reads. */
export async function buildServerBundle(entry: string, profile: Profile = LOCAL): Promise<string> {
  const tree = deckTree(dirname(entry), profile);
  const ctx = newLoadContext(tree.files, new Resolver(tree.files, tree.resolver), "production");
  const v = tree.disk.virtual(entry);
  if (v === null) throw new Error(`${entry} is outside the project`);
  try {
    const result = await esbuild.build({
      entryPoints: [v],
      bundle: true,
      write: false,
      outdir: "/out",
      absWorkingDir: ESBUILD_ROOT,
      format: "esm",
      platform: "node",
      target: "esnext",
      minify: true,
      charset: "utf8",
      legalComments: "none",
      logLevel: "silent",
      plugins: [
        vfsPlugin(ctx, {
          external: (spec) => (isBuiltin(spec) || spec.startsWith("bun:") || spec === "bun" ? spec : null),
          js: { conditions: ["bun", "node", "import", "module", "default"], extensions: [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"] },
        }),
      ],
    });
    return encodeServerBundle(result.outputFiles[0]!.text);
  } catch (err) {
    const errors = (err as { errors?: Parameters<typeof toMessages>[0] }).errors;
    if (errors) throw new Error(`Failed to build server plugin bundle ${entry}:\n${toMessages(errors).map(formatMessage).join("\n")}`);
    throw err;
  }
}

/** The deck's plugins (from package.json deps) as a manifest: every plugin listed,
 *  server entries embedded as base64, and the deck's own plugins with the audience
 *  fields it declares for them. Null without package.json or plugins. */
export async function buildPluginManifest(pkgJsonPath: string, profile: Profile = LOCAL): Promise<PluginManifest | null> {
  let plugins;
  let pkg: PkgJson;
  try {
    plugins = await discoverFromPackageJson(pkgJsonPath);
    pkg = (await Bun.file(pkgJsonPath).json()) as PkgJson;
  } catch {
    return null;
  }
  const local = deckLocalPlugins(pkg, plugins.flatMap((p) => (p.id ? [p.id] : [])));
  if (local.errors.length) throw new Error(`the deck's plugin declarations are invalid:\n  ${local.errors.join("\n  ")}`);
  if (plugins.length === 0 && local.plugins.length === 0) return null;
  const entries: PluginManifestEntry[] = [];
  for (const p of plugins) {
    const server = p.serverEntry ? await buildServerBundle(p.serverEntry, profile) : undefined;
    entries.push({ name: p.name, version: p.version, hasServer: !!server, server, id: p.id, audienceWrites: p.audienceWrites });
  }
  for (const p of local.plugins) {
    entries.push({ name: `${pkg.name ?? "deck"}#${p.id}`, version: pkg.version ?? "0.0.0", hasServer: false, id: p.id, audienceWrites: p.audienceWrites });
  }
  return { v: 1, plugins: entries };
}

/** Warnings for the audience fields a deck declares for its own plugins that its
 *  loaded source does not seem to back. Best effort: never fails a build. */
async function deckPluginCheck(pkgJsonPath: string, loaded: string[]): Promise<string[]> {
  try {
    const pkg = (await Bun.file(pkgJsonPath).json()) as PkgJson;
    const declared = deckLocalPlugins(pkg, []).plugins;
    if (declared.length === 0) return [];
    const root = dirname(resolve(pkgJsonPath)) + sep;
    const sources = loaded.filter((p) => p.startsWith(root) && !p.includes(`${sep}node_modules${sep}`) && /\.(m?[jt]sx?|mdx)$/.test(p));
    const files = await Promise.all(sources.map(async (p) => ({ path: relative(root, p), text: await Bun.file(p).text() })));
    return deckPluginWarnings(declared, files);
  } catch {
    return [];
  }
}

const ENGINE_PKG = (() => {
  try {
    return join(dirname(fileURLToPath(import.meta.resolve("@liebstoeckel/engine"))), "..", "package.json");
  } catch {
    return null;
  }
})();

/** The engine version this package builds with, the stamp's fallback when a deck
 *  bundles no engine of its own. */
async function engineVersion(): Promise<string> {
  if (!ENGINE_PKG) return "0.0.0";
  return (await readJson<{ version?: string }>(ENGINE_PKG))?.version ?? "0.0.0";
}

interface CoreRun {
  tree: DeckTree;
  deckDir: string;
  result: DeckBuildResult;
  /** real paths */
  inputs: string[];
  /** the build's warnings and notices, naming deck-relative files */
  warnings: BuildMessage[];
}

/** Run the core over a deck; a failed build throws DeckBuildError with deck-relative messages. */
async function runCore(entry: string, minify: boolean, profile: Profile): Promise<CoreRun> {
  const html = resolve(entry);
  const deckDir = dirname(html);
  const tooling = profile.name === "local" ? bunfigProblems(deckDir) : [];
  if (tooling.length) throw new DeckBuildError(tooling.map((p) => ({ text: p.message, file: p.file })));
  const tree = deckTree(deckDir, profile);
  const vHtml = tree.disk.virtual(html)!;
  // Messages name deck-relative files, so they read the same on every machine.
  const rel = (m: BuildMessage): BuildMessage => (m.file ? { ...m, file: relative(deckDir, tree.disk.real(m.file)).split(sep).join("/") } : m);
  let result: DeckBuildResult;
  try {
    result = await buildDeck({ files: tree.files, esbuild, html: vHtml, minify, resolver: tree.resolver });
  } catch (err) {
    if (err instanceof DeckBuildError) throw new DeckBuildError(err.messages.map(rel));
    throw err;
  }
  const warnings = [...result.warnings.map(rel), ...result.notices.map((n) => rel({ text: n.message, file: n.file }))];
  return { tree, deckDir, result, inputs: result.inputs.map((p) => tree.disk.real(p)), warnings };
}

/** Bundle a deck into one self-contained .html (no thumbnails; `buildDeck` in
 *  `@liebstoeckel/thumbnails/build` adds those). */
export async function bundleDeck(opts: BundleOptions = {}): Promise<BundleResult> {
  const {
    entry = "./index.html",
    outdir = "./dist",
    outfile = "index.html",
    minify = true,
    pkgJson = "./package.json",
    inlinePackage = true,
    inlineLicenses = true,
    selfNotice = DEFAULT_SELF_NOTICE,
    allowSecret = false,
    generator,
    profile = LOCAL,
    log = consoleLog,
  } = opts;
  const selfName = (await readJson<{ name?: string }>(pkgJson))?.name;
  const core = await runCore(entry, minify, profile);
  const { result, inputs } = core;
  const warnings: string[] = [];
  const warn = (line: string) => {
    warnings.push(line);
    log.warn(line);
  };
  for (const w of core.warnings) warn(`⚠ ${formatMessage(w)}`);

  // Two versions of a liebstoeckel package in one bundle would ship duplicate,
  // incompatible copies of the plugin contract side by side.
  const conflicts = firstPartyVersionConflicts(inputs, selfName);
  if (conflicts.length) throw new Error(formatFirstPartyConflicts(conflicts));

  let html = result.html;
  const manifest = await buildPluginManifest(pkgJson, profile);
  if (manifest) html = embedManifest(html, manifest);
  for (const w of await deckPluginCheck(pkgJson, inputs)) warn(w);

  if (inlineLicenses) {
    const report = buildReport(inputs, selfName);
    html = embedLicenses(html, renderNotices(report, { selfNotice }));
    const flagged = report.flagged.length ? `, ⚠ ${report.flagged.length} non-standard license(s)` : "";
    log.info(`✓ embedded license notices (${report.packages.length} third-party packages)${flagged}`);
  }

  if (inlinePackage) {
    const { collectDeckTarball, embedSource } = await import("@liebstoeckel/engine/build/source-package");
    const { zstd, files } = await collectDeckTarball(dirname(resolve(pkgJson)), { allowSecret });
    html = embedSource(html, zstd);
    log.info(`✓ embedded source package (${files.length} files, ${(zstd.length / 1024).toFixed(1)}KB)`);
  }

  const fontWarning = brandFontWarning(html);
  if (fontWarning) warn(fontWarning);

  html = stampGenerator(html, { engine: bundledEngineVersion(firstPartyVersions(inputs, selfName)) ?? (await engineVersion()), generator });

  mkdirSync(resolve(outdir), { recursive: true });
  const artifact = join(resolve(outdir), outfile);
  writeFileSync(artifact, html);
  return { artifact, inputs, warnings, timings: result.timings };
}

/** A deck's third-party license report without writing an artifact: the same
 *  module graph as a real build. Backs `liebstoeckel licenses`. */
export async function collectDeckLicenses({ entry = "./index.html", pkgJson = "./package.json", profile = LOCAL }: { entry?: string; pkgJson?: string; profile?: Profile } = {}): Promise<LicenseReport> {
  const selfName = (await readJson<{ name?: string }>(pkgJson))?.name;
  const { inputs } = await runCore(entry, false, profile);
  return buildReport(inputs, selfName);
}

/** A single build diagnostic, shaped for machine consumption. */
export interface DeckDiagnostic {
  level: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
}

/** Whether a deck builds (resolves, transforms its MDX, code steps and Tailwind,
 *  and has one copy of each liebstoeckel package), with structured diagnostics
 *  for an agent's check-and-fix loop. Writes nothing and does not type-check. */
export async function checkDeck({ entry = "./index.html", pkgJson = "./package.json", profile = LOCAL }: { entry?: string; pkgJson?: string; profile?: Profile } = {}): Promise<{
  ok: boolean;
  diagnostics: DeckDiagnostic[];
}> {
  const diag = (m: BuildMessage, level: string): DeckDiagnostic => ({
    level,
    message: m.text,
    ...(m.file ? { file: m.file } : {}),
    ...(m.line ? { line: m.line } : {}),
    ...(m.column ? { column: m.column } : {}),
  });
  try {
    const selfName = (await readJson<{ name?: string }>(pkgJson))?.name;
    const { inputs, warnings } = await runCore(entry, false, profile);
    const diagnostics: DeckDiagnostic[] = warnings.map((w) => diag(w, "warning"));
    const conflicts = firstPartyVersionConflicts(inputs, selfName);
    if (conflicts.length) return { ok: false, diagnostics: [...diagnostics, { level: "error", message: formatFirstPartyConflicts(conflicts) }] };
    return { ok: true, diagnostics };
  } catch (err) {
    if (err instanceof DeckBuildError) return { ok: false, diagnostics: err.messages.map((m) => diag(m, "error")) };
    return { ok: false, diagnostics: [{ level: "error", message: err instanceof Error ? err.message : String(err) }] };
  }
}
