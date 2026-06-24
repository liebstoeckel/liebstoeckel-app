import { test, expect, describe } from "bun:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mergeAgentsBlock, resolveScope } from "./skill";

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

describe("resolveScope (pure)", () => {
  const base = { dirGiven: false, interactive: false, cwdIsDeck: false };

  test("--global / --scope user → user", () => {
    expect(resolveScope({ ...base, global: true })).toEqual({ scope: "user" });
    expect(resolveScope({ ...base, scopeArg: "user" })).toEqual({ scope: "user" });
  });

  test("--scope project → project; invalid → error", () => {
    expect(resolveScope({ ...base, scopeArg: "project", cwdIsDeck: true })).toEqual({ scope: "project" });
    expect(resolveScope({ ...base, scopeArg: "global" })).toHaveProperty("error");
  });

  test("an explicit --dir means this project, even when not interactive", () => {
    expect(resolveScope({ ...base, dirGiven: true })).toEqual({ scope: "project" });
  });

  test("a TTY with no flags prompts", () => {
    expect(resolveScope({ ...base, interactive: true })).toEqual({ prompt: true });
  });

  test("non-interactive + no flags: project only if the cwd is a deck", () => {
    expect(resolveScope({ ...base, cwdIsDeck: true })).toEqual({ scope: "project" });
    // the field-report footgun: a non-deck cwd (e.g. ~) must NOT silently get skill files
    expect(resolveScope({ ...base, cwdIsDeck: false })).toHaveProperty("error");
  });
});

describe("skill install scope → layout", () => {
  // applySkill takes an explicit root, so the user-scope behavior is tested without
  // depending on os.homedir() (which Bun resolves at spawn, not from a runtime
  // process.env.HOME mutation). End-to-end `--global` → home is covered in e2e.
  test("user scope writes the per-agent skill dir but NO AGENTS.md (no home pollution)", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { applySkill } = await import("./skill");
    const root = mkdtempSync(join(tmpdir(), "lst-userroot-"));
    try {
      await applySkill("install", root, "user", "claude");
      expect(existsSync(join(root, ".claude", "skills", "liebstoeckel-deck", "SKILL.md"))).toBe(true);
      expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("project scope writes the per-agent skill dir AND the AGENTS.md fallback", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { applySkill } = await import("./skill");
    const root = mkdtempSync(join(tmpdir(), "lst-projroot-"));
    try {
      await applySkill("install", root, "project", "claude");
      expect(existsSync(join(root, ".claude", "skills", "liebstoeckel-deck", "SKILL.md"))).toBe(true);
      expect(existsSync(join(root, "AGENTS.md"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("skill update", () => {
  test("refreshes only the agent paths already installed", async () => {
    const { mkdtempSync, mkdirSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { runCommand } = await import("citty");
    const { skillCommand } = await import("./skill");
    const dir = mkdtempSync(join(tmpdir(), "lst-skillup-"));
    try {
      // simulate a previous claude-only install (stale, empty skill dir)
      mkdirSync(join(dir, ".claude", "skills", "liebstoeckel-deck"), { recursive: true });
      await runCommand(skillCommand, { rawArgs: ["update", "--dir", dir] });
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
    for (const r of ["authoring", "components", "editing", "plugins", "troubleshooting"]) {
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
