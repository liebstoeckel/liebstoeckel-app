import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkServePlugins, pluginErrorPage, servePluginSpecs } from "./serve-plugins";

function deck(bunfig?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "lst-serve-plugins-"));
  if (bunfig !== undefined) writeFileSync(join(dir, "bunfig.toml"), bunfig);
  return dir;
}

describe("checkServePlugins", () => {
  test("no bunfig.toml means nothing to check", () => {
    expect(checkServePlugins(deck())).toEqual([]);
  });

  test("a bunfig.toml without serve plugins passes", () => {
    expect(checkServePlugins(deck('[install]\nexact = true\n'))).toEqual([]);
  });

  test("a relative plugin path that exists resolves", () => {
    const dir = deck('[serve.static]\nplugins = ["./my-plugin.ts"]\n');
    writeFileSync(join(dir, "my-plugin.ts"), "export default { name: 'x', setup() {} };\n");
    expect(checkServePlugins(dir)).toEqual([]);
  });

  test("a plugin that does not resolve is reported by name", () => {
    const dir = deck('[serve.static]\nplugins = ["./missing-plugin.ts", "./also-missing.ts"]\n');
    writeFileSync(join(dir, "also-missing.ts"), "export default {};\n");
    const problems = checkServePlugins(dir);
    expect(problems.map((p) => p.plugin)).toEqual(["./missing-plugin.ts"]);
    expect(problems[0]!.message).toContain(dir);
  });

  test("a single string instead of a list is read too", () => {
    expect(servePluginSpecs(deck('[serve.static]\nplugins = "./one.ts"\n')).plugins).toEqual(["./one.ts"]);
  });

  test("invalid TOML is reported, not thrown", () => {
    const problems = checkServePlugins(deck("[serve.static\nplugins = ["));
    expect(problems).toHaveLength(1);
    expect(problems[0]!.plugin).toBe("bunfig.toml");
  });
});

describe("pluginErrorPage", () => {
  test("escapes what comes from bunfig.toml and names the fix", () => {
    const html = pluginErrorPage("/decks/a<b", [{ plugin: "<script>x</script>", message: "cannot be found" }], "/deck/t/__plugins");
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(html).toContain("/decks/a&lt;b");
    expect(html).toContain("bun install");
    expect(html).toContain('"/deck/t/__plugins"');
  });
});
