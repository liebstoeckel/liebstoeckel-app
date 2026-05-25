import { join } from "node:path";
import tailwind from "bun-plugin-tailwind";
import { discoverFromPackageJson } from "@present-it/plugin-sdk/discovery";
import {
  embedManifest,
  encodeServerBundle,
  type PluginManifest,
  type PluginManifestEntry,
} from "@present-it/plugin-sdk/manifest";
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

  // Embed the plugin manifest (incl. base64 server bundles) into the single file.
  const manifest = await buildPluginManifest(pkgJson);
  if (manifest) {
    const outHtml = join(outdir, "index.html");
    const html = await Bun.file(outHtml).text();
    await Bun.write(outHtml, embedManifest(html, manifest));
  }

  return result;
}
