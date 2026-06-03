import { rm } from "node:fs/promises";
import { basename, join, dirname } from "node:path";
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

/** Bundle a plugin's server entry into a self-contained, base64-encoded ESM module
 *  (target:"bun"). It externalizes nothing host-specific because the host injects
 *  `ctx` — so it rehydrates with no node_modules resolution. */
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

// Bundles a deck into a single self-contained .html — the browser-free build
// primitive (no Chromium). Plugins (Tailwind, MDX) only run via the Bun.build()
// JS API — NOT the `bun build` CLI. `compile:true` + target:"browser" inline
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
  allowSecret = false,
}: {
  entry?: string;
  outdir?: string;
  /** Final artifact name within `outdir` (default `index.html`; the user-facing
   *  `buildDeck` wrapper passes the deck slug, e.g. `poll-demo.html` — ADR 0068). */
  outfile?: string;
  minify?: boolean;
  pkgJson?: string;
  /** Embed the deck's own source as a recoverable package so the .html is ejectable (ADR 0039). */
  inlinePackage?: boolean;
  /** Force the source-embed past its secret gate (loud, explicit). */
  allowSecret?: boolean;
} = {}) {
  const result = await Bun.build({
    entrypoints: [entry],
    outdir,
    minify,
    target: "browser",
    compile: true,
    plugins: [tailwind, mdx, visxEsmInterop],
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error("Deck build failed");
  }

  // Escape `</script>` inside the inlined bundle, then embed the plugin manifest
  // (incl. base64 server bundles) into the single file. Bun.build names its output
  // after the entry basename (`index.html`); we post-process that and ship it under
  // `outfile` (the deck slug for the user-facing build — ADR 0068).
  const built = join(outdir, basename(entry));
  const outHtml = join(outdir, outfile);
  let html = escapeInlineModuleScript(await Bun.file(built).text());
  const manifest = await buildPluginManifest(pkgJson);
  if (manifest) html = embedManifest(html, manifest);

  // Embed the deck's own source so the compiled .html ejects back to an editable project.
  if (inlinePackage) {
    const { collectDeckTarball, embedSource } = await import("./source-package");
    const { zstd, files } = await collectDeckTarball(dirname(pkgJson), { allowSecret });
    html = embedSource(html, zstd);
    console.log(`✓ embedded source package (${files.length} files, ${(zstd.length / 1024).toFixed(1)}KB)`);
  }

  await Bun.write(outHtml, html);
  // Drop Bun's `index.html` emit when shipping under a different slug name.
  if (built !== outHtml) await rm(built, { force: true });

  return result;
}

/** A single build diagnostic, shaped for machine consumption (ADR 0045). */
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
 * Validate that a deck **bundles** — resolves, transforms (MDX/Tailwind), and the
 * visx ESM-interop holds — without writing any artifact or capturing thumbnails
 * (ADR 0045). Runs the same plugin pipeline as `bundleDeck` with `throw: false` and
 * returns structured diagnostics for an agent's check → fix loop. It does **not**
 * type-check (Bun.build doesn't); it answers "does this deck build?".
 */
export async function checkDeck({ entry = "./index.html" }: { entry?: string } = {}): Promise<{
  ok: boolean;
  diagnostics: DeckDiagnostic[];
}> {
  try {
    const result = await Bun.build({
      entrypoints: [entry],
      target: "browser",
      plugins: [tailwind, mdx, visxEsmInterop],
      throw: false,
    });
    return { ok: result.success, diagnostics: result.logs.map(toDiagnostic) };
  } catch (err) {
    // resolution / plugin failures can still throw (e.g. AggregateError)
    const errs = err instanceof AggregateError ? err.errors : [err];
    return { ok: false, diagnostics: errs.map(toDiagnostic) };
  }
}
