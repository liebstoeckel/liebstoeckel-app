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

describe("skill update", () => {
  test("refreshes only the agent paths already installed", async () => {
    const { mkdtempSync, mkdirSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { runSkill } = await import("./skill");
    const dir = mkdtempSync(join(tmpdir(), "lst-skillup-"));
    try {
      // simulate a previous claude-only install (stale, empty skill dir)
      mkdirSync(join(dir, ".claude", "skills", "liebstoeckel-deck"), { recursive: true });
      await runSkill(["update", "--dir", dir]);
      expect(existsSync(join(dir, ".claude", "skills", "liebstoeckel-deck", "SKILL.md"))).toBe(true);
      expect(existsSync(join(dir, "AGENTS.md"))).toBe(true);
      // update must not introduce agent paths that weren't installed
      expect(existsSync(join(dir, ".cursor"))).toBe(false);
      expect(existsSync(join(dir, ".agents"))).toBe(false);
      const md = await Bun.file(join(dir, ".claude", "skills", "liebstoeckel-deck", "SKILL.md")).text();
      expect(md).toMatch(/\n\s*version:\s*\d+\.\d+\.\d+/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("bundled skill source", () => {
  const SRC = fileURLToPath(new URL("../skill", import.meta.url));
  test("ships SKILL.md + the referenced files", () => {
    expect(existsSync(join(SRC, "SKILL.md"))).toBe(true);
    expect(existsSync(join(SRC, "AGENTS.md"))).toBe(true);
    for (const r of ["authoring", "components", "editing", "troubleshooting"]) {
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
