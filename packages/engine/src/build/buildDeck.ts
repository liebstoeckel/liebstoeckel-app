import { join } from "node:path";
import tailwind from "bun-plugin-tailwind";
import { discoverFromPackageJson } from "@liebstoeckel/plugin-sdk/discovery";
import {
  embedManifest,
  encodeServerBundle,
  type PluginManifest,
  type PluginManifestEntry,
} from "@liebstoeckel/plugin-sdk/manifest";
import mdx from "./mdx-plugin";

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
    entries.push({ name: p.name, version: p.version, hasServer: !!server, server });
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

// Builds a deck to a single self-contained .html. Plugins (Tailwind, MDX) only
// run via the Bun.build() JS API — NOT the `bun build` CLI. `compile:true` +
// target:"browser" inline JS/CSS and base64 the assets. Verified on Bun 1.3.
export async function buildDeck({
  entry = "./index.html",
  outdir = "./dist",
  minify = true,
  pkgJson = "./package.json",
}: {
  entry?: string;
  outdir?: string;
  minify?: boolean;
  pkgJson?: string;
} = {}) {
  const result = await Bun.build({
    entrypoints: [entry],
    outdir,
    minify,
    target: "browser",
    compile: true,
    plugins: [tailwind, mdx],
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error("Deck build failed");
  }

  // Escape `</script>` inside the inlined bundle, then embed the plugin manifest
  // (incl. base64 server bundles) into the single file.
  const outHtml = join(outdir, "index.html");
  let html = escapeInlineModuleScript(await Bun.file(outHtml).text());
  const manifest = await buildPluginManifest(pkgJson);
  if (manifest) html = embedManifest(html, manifest);
  await Bun.write(outHtml, html);

  return result;
}
