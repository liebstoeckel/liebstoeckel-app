import { test, expect, describe } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rehydrateServerBundle } from "@liebstoeckel/plugin-sdk/manifest";
import { buildServerBundle, buildPluginManifest, escapeInlineModuleScript } from "./buildDeck";

describe("buildServerBundle", () => {
  // Real `Bun.build` (target:bun). Isolated (unique tmp dir), but bundling is
  // CPU-heavy and slows sharply under full-suite/loaded-CI host load — the default
  // 5s timeout flakes there. ~0.5s unloaded; 60s is generous headroom for a loaded
  // box while still catching a genuine hang.
  test(
    "bundles a server entry (target:bun) → base64 that rehydrates & runs with ctx",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "srvplugin-"));
      const entry = join(dir, "server.ts");
      // a server plugin that bundles a local helper (proves bundling, not just copying)
      await Bun.write(join(dir, "helper.ts"), `export const bump = (n: number): number => n + 100;`);
      await Bun.write(entry, `import { bump } from "./helper"; export default (ctx: { n: number }) => bump(ctx.n);`);

      const b64 = await buildServerBundle(entry);
      expect(typeof b64).toBe("string");
      const mod = await rehydrateServerBundle(b64, "fixture");
      expect((mod.default as (c: { n: number }) => number)({ n: 5 })).toBe(105);
    },
    60_000,
  );
});

describe("buildPluginManifest", () => {
  test("returns null when package.json is missing", async () => {
    expect(await buildPluginManifest("/no/such/package.json")).toBeNull();
  });
});

describe("escapeInlineModuleScript", () => {
  test("escapes </script> inside the module bundle, keeps the real terminator", () => {
    const html = '<body><script type="module">const s="<div></script></body></html>";doStuff()</script></body></html>';
    const out = escapeInlineModuleScript(html);
    // only the </script token is neutralised (</body>, </html> untouched);
    // `<\/script>` is an identical JS string value but no longer a tag terminator
    expect(out).toContain('const s="<div><\\/script></body></html>";');
    // exactly one literal </script> remains in the document — the real terminator
    expect(out.match(/<\/script>/g)?.length).toBe(1);
    expect(out.endsWith("</script></body></html>")).toBe(true);
  });

  test("no-op when there is no inline module script", () => {
    const html = '<body><script src="x.js"></script></body>';
    expect(escapeInlineModuleScript(html)).toBe(html);
  });
});
