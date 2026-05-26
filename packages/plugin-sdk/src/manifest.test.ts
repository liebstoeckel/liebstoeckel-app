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
    { name: "@liebstoeckel/plugin-poll", version: "0.0.0", hasServer: false },
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
    expect(out).toContain("data-liebstoeckel-plugins");
    expect(out.indexOf("</script></body>")).toBeGreaterThan(-1);
    expect(extractManifest(out)).toEqual(manifest);
  });

  test("extract returns null when no manifest (standalone deck)", () => {
    expect(extractManifest("<html><body>nothing</body></html>")).toBeNull();
  });

  test("inserts before the LAST </body> (bundle may contain '</body>' in a JS string)", () => {
    // an inlined module bundle whose JS string contains "</body>" (e.g. an iframe srcdoc)
    const html = '<html><body><script type="module">const s="x</body></html>y";z()</script></body></html>';
    const out = embedManifest(html, manifest);
    // the JS string is untouched; the manifest lands at the real document end, not mid-bundle
    expect(out).toContain('const s="x</body></html>y";z()');
    expect(out.indexOf("data-liebstoeckel-plugins")).toBeGreaterThan(out.indexOf("</script>"));
    expect(extractManifest(out)).toEqual(manifest);
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
