import { test, expect, describe } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rehydrateServerBundle } from "@present-it/plugin-sdk/manifest";
import { buildServerBundle, buildPluginManifest } from "./buildDeck";

describe("buildServerBundle", () => {
  test("bundles a server entry (target:bun) → base64 that rehydrates & runs with ctx", async () => {
    const dir = mkdtempSync(join(tmpdir(), "srvplugin-"));
    const entry = join(dir, "server.ts");
    // a server plugin that bundles a local helper (proves bundling, not just copying)
    await Bun.write(join(dir, "helper.ts"), `export const bump = (n: number): number => n + 100;`);
    await Bun.write(entry, `import { bump } from "./helper"; export default (ctx: { n: number }) => bump(ctx.n);`);

    const b64 = await buildServerBundle(entry);
    expect(typeof b64).toBe("string");
    const mod = await rehydrateServerBundle(b64, "fixture");
    expect((mod.default as (c: { n: number }) => number)({ n: 5 })).toBe(105);
  });
});

describe("buildPluginManifest", () => {
  test("returns null when package.json is missing", async () => {
    expect(await buildPluginManifest("/no/such/package.json")).toBeNull();
  });
});
