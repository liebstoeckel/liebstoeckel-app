import { rm } from "node:fs/promises";
import { basename, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import tailwind from "bun-plugin-tailwind";
import { discoverFromPackageJson } from "@liebstoeckel/plugin-sdk/discovery";
import {
  embedManifest,
  encodeServerBundle,
  type PluginManifest,
  type PluginManifestEntry,
} from "@liebstoeckel/plugin-sdk/manifest";
import mdx from "./mdx-plugin";
import visxEsmInterop from "./visx-esm-plugin";
import { brandFontWarning } from "./font-audit";
import {
  createLicenseCollector,
  renderNotices,
  embedLicenses,
  formatFirstPartyConflicts,
  type LicenseReport,
} from "./licenses";

// The single-copy guard primitives are part of the public build surface (the e2e
// upgrade tier reduces over a real installed tree with them; (internal ADR)).
export { firstPartyVersionConflicts, formatFirstPartyConflicts, type FirstPartyConflict } from "./licenses";

/** The plugins every deck build runs (Tailwind CSS gen, MDX compile, visx ESM
 *  interop). Shared so the license collector and any collect-only build resolve
 *  the exact same module graph as a real build. */
const DECK_PLUGINS = [tailwind, mdx, visxEsmInterop];

/** Default first-party notice embedded alongside the third-party block, the
 *  MPL-2.0 line + public source pointer that MPL §3.2(b)/§3.4 require to travel
 *  with the inlined engine code. */
const DEFAULT_SELF_NOTICE =
  "This presentation embeds the liebstoeckel presentation engine, licensed under\n" +
  "the Mozilla Public License 2.0. Source code for the covered files is available\n" +
  "at https://github.com/liebstoeckel/liebstoeckel, you may obtain it at no charge.";

/** Bundle a plugin's server entry into a self-contained, base64-encoded ESM module
 *  (target:"bun"). It externalizes nothing host-specific because the host injects
 *  `ctx`, so it rehydrates with no node_modules resolution. */
export async function buildServerBundle(entry: string): Promise<string> {
  const built = await Bun.build({ entrypoints: [entry], target: "bun", format: "esm", minify: true });
  if (!built.success) {
    for (const log of built.logs) console.error(log);
    throw new Error(`Failed to build server plugin bundle: ${entry}`);
  }
  return encodeServerBundle(await built.outputs[0]!.text());
}

/** Discover the deck's plugins (from package.json deps) and build a manifest:
 *  every plugin listed; server entries embedded as base64. */
export async function buildPluginManifest(pkgJsonPath: string): Promise<PluginManifest | null> {
  let plugins;
  try {
    plugins = await discoverFromPackageJson(pkgJsonPath);
  } catch {
    return null; // no package.json / unreadable → no plugins
  }
  if (plugins.length === 0) return null;

  const entries: PluginManifestEntry[] = [];
  for (const p of plugins) {
    const server = p.serverEntry ? await buildServerBundle(p.serverEntry) : undefined;
    entries.push({
      name: p.name,
      version: p.version,
      hasServer: !!server,
      server,
      id: p.id,
      audienceWrites: p.audienceWrites,
    });
  }
  return { v: 1, plugins: entries };
}

/** The deck's own package name (so the license report can exclude it, a deck never
 *  lists itself). Best-effort: a missing/unreadable package.json just yields undefined. */
async function readPkgName(pkgJsonPath: string): Promise<string | undefined> {
  try {
    return (await Bun.file(pkgJsonPath).json()).name;
  } catch {
    return undefined;
  }
}

/** Bun inlines the JS bundle as `<script type="module">…</script>`, but does NOT escape
 *  `</script>` sequences that occur inside JS string literals (e.g. a deck embedding HTML
 *  through an iframe `srcdoc`). The HTML parser would close the inline script at the first
 *  such `</script>`, dumping the rest of the bundle as text. Escape every `</script` →
 *  `<\/script` inside the module body (a no-op for the JS string value, but no longer a
 *  tag terminator). Runs on Bun's fresh output, where the module bundle is the document's
 *  last element, so its real terminator is the final `</script>`. */
export function escapeInlineModuleScript(html: string): string {
  const open = '<script type="module">';
  const start = html.indexOf(open);
  if (start < 0) return html;
  const contentStart = start + open.length;
  const close = html.lastIndexOf("</script>");
  if (close <= contentStart) return html;
  const body = html.slice(contentStart, close).replace(/<\/script/gi, "<\\/script");
  return html.slice(0, contentStart) + body + html.slice(close);
}

/** Identifies the tool that drove the build (e.g. the CLI), stamped alongside the
 *  engine version so a built deck records what produced it. */
export interface Generator {
  name: string;
  version: string;
}

const ENGINE_PKG = fileURLToPath(new URL("../../package.json", import.meta.url));

/** The engine's own version, read from its package.json. Best-effort: a build must
 *  never fail because a version string couldn't be read. */
async function engineVersion(): Promise<string> {
  try {
    return ((await Bun.file(ENGINE_PKG).json()) as { version?: string }).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** Stamp the build's provenance into the document head: a human-readable comment
 *  right after the doctype (the first thing in "view source") and a standard
 *  `<meta name="generator">` that tooling can parse. Records the engine version
 *  (always) and the invoking tool's version (e.g. the CLI) when the caller passes
 *  one. Versions only, no timestamp, so the same deck still builds to the same
 *  bytes (the source-package embed is byte-deterministic). */
export function stampGenerator(html: string, parts: { engine: string; generator?: Generator }): string {
  const tools = [`engine ${parts.engine}`];
  if (parts.generator) tools.push(`${parts.generator.name} ${parts.generator.version}`);
  const summary = `liebstoeckel ${tools.join(", ")}`;
  return html
    .replace(/<!doctype html>/i, (m) => `${m}\n<!-- Generated by ${summary} · https://liebstoeckel.app -->`)
    .replace(/<head[^>]*>/i, (m) => `${m}\n    <meta name="generator" content="${summary}" />`);
}

// Bundles a deck into a single self-contained .html, the browser-free build
// primitive (no Chromium). Plugins (Tailwind, MDX) only run via the Bun.build()
// JS API, NOT the `bun build` CLI. `compile:true` + target:"browser" inline
// JS/CSS and base64 the assets. Verified on Bun 1.3.
//
// For the batteries-included default (this + slide thumbnails) use `buildDeck`
// from `@liebstoeckel/thumbnails/build`, which wraps this. Kept here, dependency-
// free, so engine never pulls in the headless-browser capturer (playwright-core).
export async function bundleDeck({
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
}: {
  entry?: string;
  outdir?: string;
  /** Final artifact name within `outdir` (default `index.html`; the user-facing
   *  `buildDeck` wrapper passes the deck slug, e.g. `poll-demo.html`, (internal ADR)). */
  outfile?: string;
  minify?: boolean;
  pkgJson?: string;
  /** Embed the deck's own source as a recoverable package so the .html is ejectable ((internal ADR)). */
  inlinePackage?: boolean;
  /** Embed a THIRD-PARTY-NOTICES block computed from the bundle's real module graph.
   *  Minify strips license comments, so we re-add the required notices. */
  inlineLicenses?: boolean;
  /** First-party notice prepended to the notices block (default: the MPL line). */
  selfNotice?: string;
  /** Force the source-embed past its secret gate (loud, explicit). */
  allowSecret?: boolean;
  /** The tool driving the build (e.g. the CLI), recorded in the generator stamp
   *  next to the engine version. Omit when the engine builds on its own behalf. */
  generator?: Generator;
} = {}) {
  // The collector always runs (a pure onLoad observer): besides licenses it backs the
  // single-copy guard below, which must hold whether or not we embed notices.
  const licenses = createLicenseCollector({ selfName: await readPkgName(pkgJson) });
  const result = await Bun.build({
    entrypoints: [entry],
    outdir,
    minify,
    target: "browser",
    compile: true,
    plugins: [...DECK_PLUGINS, licenses.plugin],
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error("Deck build failed");
  }

  // Fail loud if the bundle pulled two versions of a liebstoeckel package — a deck is
  // one inlined .html, so mixed framework versions ship duplicate, incompatible copies.
  const conflicts = licenses.conflicts();
  if (conflicts.length) throw new Error(formatFirstPartyConflicts(conflicts));

  // Escape `</script>` inside the inlined bundle, then embed the plugin manifest
  // (incl. base64 server bundles) into the single file. Bun.build names its output
  // after the entry basename (`index.html`); we post-process that and ship it under
  // `outfile` (the deck slug for the user-facing build, (internal ADR)).
  const built = join(outdir, basename(entry));
  const outHtml = join(outdir, outfile);
  let html = escapeInlineModuleScript(await Bun.file(built).text());
  const manifest = await buildPluginManifest(pkgJson);
  if (manifest) html = embedManifest(html, manifest);

  // Re-add the third-party license notices that minify stripped, computed
  // from the modules this build actually bundled, so it tracks font/lib swaps.
  if (inlineLicenses) {
    const report = licenses.report();
    html = embedLicenses(html, renderNotices(report, { selfNotice }));
    const flagged = report.flagged.length ? `, ⚠ ${report.flagged.length} non-standard license(s)` : "";
    console.log(`✓ embedded license notices (${report.packages.length} third-party packages)${flagged}`);
  }

  // Embed the deck's own source so the compiled .html ejects back to an editable project.
  if (inlinePackage) {
    const { collectDeckTarball, embedSource } = await import("./source-package");
    const { zstd, files } = await collectDeckTarball(dirname(pkgJson), { allowSecret });
    html = embedSource(html, zstd);
    console.log(`✓ embedded source package (${files.length} files, ${(zstd.length / 1024).toFixed(1)}KB)`);
  }

  // Warn (don't fail) if a brand names a `"… Variable"` webfont that no @font-face
  // bundles, it would silently fall back to a system font in the shipped file.
  const fontWarning = brandFontWarning(html);
  if (fontWarning) console.warn(fontWarning);

  // Stamp the build's provenance (engine + invoking-tool versions) into the head.
  html = stampGenerator(html, { engine: await engineVersion(), generator });

  await Bun.write(outHtml, html);
  // Drop Bun's `index.html` emit when shipping under a different slug name.
  if (built !== outHtml) await rm(built, { force: true });

  return result;
}

/** Resolve a deck's third-party license report WITHOUT emitting an artifact, runs
 *  the same plugin set as a real build so the module graph matches, then discards
 *  the output. Backs `liebstoeckel licenses` over a deck directory. */
export async function collectDeckLicenses({
  entry = "./index.html",
  pkgJson = "./package.json",
}: { entry?: string; pkgJson?: string } = {}): Promise<LicenseReport> {
  const licenses = createLicenseCollector({ selfName: await readPkgName(pkgJson) });
  const result = await Bun.build({
    entrypoints: [entry],
    minify: false,
    target: "browser",
    plugins: [...DECK_PLUGINS, licenses.plugin],
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error("Deck build failed");
  }
  return licenses.report();
}

/** A single build diagnostic, shaped for machine consumption ((internal ADR)). */
export interface DeckDiagnostic {
  level: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
}

function toDiagnostic(log: unknown): DeckDiagnostic {
  if (typeof log === "string") return { level: "error", message: log };
  const l = log as { level?: string; message?: string; position?: { file?: string; line?: number; column?: number } | null };
  const pos = l?.position ?? undefined;
  const pos1 = (n?: number) => (typeof n === "number" && n > 0 ? n : undefined);
  return {
    level: l?.level ?? "error",
    message: l?.message ?? String(log),
    file: pos?.file || undefined,
    line: pos1(pos?.line),
    column: pos1(pos?.column),
  };
}

/**
 * Validate that a deck **bundles**, resolves, transforms (MDX/Tailwind), and the
 * visx ESM-interop holds, without writing any artifact or capturing thumbnails
 * ((internal ADR)). Runs the same plugin pipeline as `bundleDeck` with `throw: false` and
 * returns structured diagnostics for an agent's check → fix loop. It does **not**
 * type-check (Bun.build doesn't); it answers "does this deck build?".
 */
export async function checkDeck({
  entry = "./index.html",
  pkgJson = "./package.json",
}: { entry?: string; pkgJson?: string } = {}): Promise<{
  ok: boolean;
  diagnostics: DeckDiagnostic[];
}> {
  try {
    const licenses = createLicenseCollector({ selfName: await readPkgName(pkgJson) });
    const result = await Bun.build({
      entrypoints: [entry],
      target: "browser",
      plugins: [...DECK_PLUGINS, licenses.plugin],
      throw: false,
    });
    const diagnostics = result.logs.map(toDiagnostic);
    let ok = result.success;
    // Only meaningful on a graph that fully resolved; surface a duplicate liebstoeckel
    // version as a loud diagnostic (ADR: the consumption-side single-copy guard).
    if (ok) {
      const conflicts = licenses.conflicts();
      if (conflicts.length) {
        ok = false;
        diagnostics.push({ level: "error", message: formatFirstPartyConflicts(conflicts) });
      }
    }
    return { ok, diagnostics };
  } catch (err) {
    // resolution / plugin failures can still throw (e.g. AggregateError)
    const errs = err instanceof AggregateError ? err.errors : [err];
    return { ok: false, diagnostics: errs.map(toDiagnostic) };
  }
}
