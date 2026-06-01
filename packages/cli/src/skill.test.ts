import { test, expect, describe } from "bun:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mergeAgentsBlock } from "./skill";

const BLOCK = `<!-- liebstoeckel:start -->\nmanaged content\n<!-- liebstoeckel:end -->`;

describe("mergeAgentsBlock (pure)", () => {
  test("appends to an empty file", () => {
    expect(mergeAgentsBlock("", BLOCK)).toBe(BLOCK + "\n");
  });

  test("appends below existing content, preserving it", () => {
    const out = mergeAgentsBlock("# My project\n\nSome notes.", BLOCK);
    expect(out.startsWith("# My project")).toBe(true);
    expect(out).toContain(BLOCK);
  });

  test("replaces the managed block in place (idempotent)", () => {
    const once = mergeAgentsBlock("# P", BLOCK);
    const twice = mergeAgentsBlock(once, BLOCK);
    expect(twice).toBe(once);
    expect((twice.match(/liebstoeckel:start/g) ?? []).length).toBe(1);
  });

  test("updates the block content without duplicating markers", () => {
    const v1 = mergeAgentsBlock("# P", `<!-- liebstoeckel:start -->\nv1\n<!-- liebstoeckel:end -->`);
    const v2 = mergeAgentsBlock(v1, `<!-- liebstoeckel:start -->\nv2\n<!-- liebstoeckel:end -->`);
    expect(v2).toContain("v2");
    expect(v2).not.toContain("v1");
    expect((v2.match(/liebstoeckel:start/g) ?? []).length).toBe(1);
  });
});

describe("bundled skill source", () => {
  const SRC = fileURLToPath(new URL("../skill", import.meta.url));
  test("ships SKILL.md + the referenced files", () => {
    expect(existsSync(join(SRC, "SKILL.md"))).toBe(true);
    expect(existsSync(join(SRC, "AGENTS.md"))).toBe(true);
    for (const r of ["authoring", "charts", "editing", "troubleshooting"]) {
      expect(existsSync(join(SRC, "references", `${r}.md`))).toBe(true);
    }
  });

  test("SKILL.md frontmatter has a name + a discovery description", async () => {
    const md = await Bun.file(join(SRC, "SKILL.md")).text();
    expect(md).toMatch(/\nname:\s*liebstoeckel-deck/);
    // description must say what + when (used for auto-trigger across agents)
    expect(md.toLowerCase()).toContain("use when");
  });
});
