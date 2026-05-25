import { test, expect, describe } from "bun:test";
import {
  encodeManifest,
  parseManifest,
  embedManifest,
  extractManifest,
  encodeServerBundle,
  rehydrateServerBundle,
  type PluginManifest,
} from "./manifest";

const manifest: PluginManifest = {
  v: 1,
  plugins: [
    { name: "@present-it/plugin-poll", version: "0.0.0", hasServer: false },
    { name: "@acme/timer", version: "1.0.0", hasServer: true, server: encodeServerBundle("export default (c)=>c") },
  ],
};

describe("manifest encode/embed/extract", () => {
  test("encode/parse round-trip", () => {
    expect(parseManifest(encodeManifest(manifest))).toEqual(manifest);
  });

  test("embed into HTML then extract", () => {
    const html = "<html><head></head><body><div id=root></div></body></html>";
    const out = embedManifest(html, manifest);
    expect(out).toContain("data-present-it-plugins");
    expect(out.indexOf("</script></body>")).toBeGreaterThan(-1);
    expect(extractManifest(out)).toEqual(manifest);
  });

  test("extract returns null when no manifest (standalone deck)", () => {
    expect(extractManifest("<html><body>nothing</body></html>")).toBeNull();
  });
});

describe("server bundle base64 round-trip + rehydrate", () => {
  test("decodes and imports an embedded server module, callable with ctx", async () => {
    const src = "export default (ctx) => ctx.n * 3;";
    const b64 = encodeServerBundle(src);
    const mod = await rehydrateServerBundle(b64, "@acme/triple");
    expect(typeof mod.default).toBe("function");
    expect((mod.default as (c: { n: number }) => number)({ n: 7 })).toBe(21);
  });
});
