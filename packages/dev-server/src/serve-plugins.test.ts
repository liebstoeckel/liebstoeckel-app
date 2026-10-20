import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkServePlugins, formatPluginProblems, servePluginSpecs } from "./serve-plugins";

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

  test("the plugins the scaffold wrote are ignored, in either spelling, installed or not", () => {
    const dir = deck(
      '[serve.static]\nplugins = ["bun-plugin-tailwind", "@liebstoeckel/engine/mdx-plugin", "@liebstoeckel/engine/visx-esm-plugin", "../../packages/engine/src/build/mdx-plugin.ts"]\n',
    );
    expect(checkServePlugins(dir)).toEqual([]);
  });

  test("any other Bun plugin is reported by name, even when it exists", () => {
    const dir = deck('[serve.static]\nplugins = ["bun-plugin-tailwind", "./my-plugin.ts"]\n');
    writeFileSync(join(dir, "my-plugin.ts"), "export default { name: 'x', setup() {} };\n");
    const problems = checkServePlugins(dir);
    expect(problems.map((p) => p.plugin)).toEqual(["./my-plugin.ts"]);
    const lines = formatPluginProblems(dir, problems);
    expect(lines[0]).toContain('bunfig.toml plugin "./my-plugin.ts" is a Bun plugin');
    expect(lines[1]).toContain("remove it from [serve.static] plugins");
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
