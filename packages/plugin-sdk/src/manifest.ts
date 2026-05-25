import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface PluginManifestEntry {
  name: string;
  version: string;
  hasServer: boolean;
  /** base64-encoded, self-contained server bundle (target:"bun"); present iff hasServer */
  server?: string;
}

export interface PluginManifest {
  v: 1;
  plugins: PluginManifestEntry[];
}

export const MANIFEST_ATTR = "data-present-it-plugins";

export const encodeManifest = (m: PluginManifest): string => JSON.stringify(m);
export const parseManifest = (json: string): PluginManifest => JSON.parse(json) as PluginManifest;

/** Embed the manifest as an inert JSON <script> before </body> (browser never runs it). */
export function embedManifest(html: string, m: PluginManifest): string {
  const tag = `<script type="application/json" ${MANIFEST_ATTR}>${encodeManifest(m)}</script>`;
  return html.includes("</body>") ? html.replace("</body>", `${tag}</body>`) : html + tag;
}

/** Extract the manifest from a built HTML, or null if none. */
export function extractManifest(html: string): PluginManifest | null {
  const re = new RegExp(`<script[^>]*${MANIFEST_ATTR}[^>]*>([\\s\\S]*?)</script>`, "i");
  const m = html.match(re);
  if (!m) return null;
  try {
    return parseManifest(m[1]!);
  } catch {
    return null;
  }
}

export const encodeServerBundle = (source: string | Uint8Array): string =>
  Buffer.from(source).toString("base64");

/** Decode a base64 server bundle to a temp ESM module and import it. The default
 *  export is the plugin's `server(ctx)` function. */
export async function rehydrateServerBundle(base64: string, name: string): Promise<{ default?: unknown }> {
  const code = Buffer.from(base64, "base64").toString("utf8");
  const dir = mkdtempSync(join(tmpdir(), "present-it-"));
  const file = join(dir, `${name.replace(/[^a-z0-9]/gi, "_")}.mjs`);
  writeFileSync(file, code);
  return (await import(file)) as { default?: unknown };
}
