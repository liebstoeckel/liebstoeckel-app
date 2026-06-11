import { test, expect, describe } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  compareVersions,
  isNewer,
  shouldRefresh,
  remindersEnabled,
  parseSkillVersion,
  installedSkillVersion,
  type CheckState,
} from "./update";

describe("compareVersions / isNewer (pure)", () => {
  test("orders numeric triples numerically, not lexically", () => {
    expect(compareVersions("0.10.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "0.99.99")).toBeGreaterThan(0);
    expect(compareVersions("0.3.4", "0.3.4")).toBe(0);
    expect(compareVersions("0.3.4", "0.3.5")).toBeLessThan(0);
  });

  test("a prerelease sorts before its release", () => {
    expect(compareVersions("1.0.0-rc.1", "1.0.0")).toBeLessThan(0);
    expect(compareVersions("1.0.0", "1.0.0-rc.1")).toBeGreaterThan(0);
  });

  test("tolerates a leading v and unparseable input (never claims an update)", () => {
    expect(compareVersions("v1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("garbage", "1.0.0")).toBe(0);
    expect(isNewer("garbage", "1.0.0")).toBe(false);
  });

  test("isNewer handles null/undefined (failed check cached as null)", () => {
    expect(isNewer(null, "1.0.0")).toBe(false);
    expect(isNewer(undefined, "1.0.0")).toBe(false);
    expect(isNewer("1.0.1", "1.0.0")).toBe(true);
  });
});

describe("shouldRefresh (pure)", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const state = (ago: number): CheckState => ({ checkedAt: 1_000_000_000_000 - ago, latest: "1.0.0" });
  const NOW = 1_000_000_000_000;

  test("no cache → refresh", () => {
    expect(shouldRefresh(null, NOW)).toBe(true);
  });
  test("fresh cache → no refresh", () => {
    expect(shouldRefresh(state(DAY / 2), NOW)).toBe(false);
  });
  test("expired cache → refresh", () => {
    expect(shouldRefresh(state(DAY + 1), NOW)).toBe(true);
  });
  test("clock went backwards → refresh", () => {
    expect(shouldRefresh({ checkedAt: NOW + DAY, latest: null }, NOW)).toBe(true);
  });
});

describe("remindersEnabled (pure)", () => {
  test("on for an interactive terminal", () => {
    expect(remindersEnabled([], {}, true)).toBe(true);
  });
  test("off for pipes (agents)", () => {
    expect(remindersEnabled([], {}, false)).toBe(false);
    expect(remindersEnabled([], {}, undefined)).toBe(false);
  });
  test("off for --json even on a TTY", () => {
    expect(remindersEnabled(["list", "--json"], {}, true)).toBe(false);
  });
  test("off in CI and when explicitly disabled", () => {
    expect(remindersEnabled([], { CI: "true" }, true)).toBe(false);
    expect(remindersEnabled([], { LIEBSTOECKEL_NO_UPDATE_CHECK: "1" }, true)).toBe(false);
  });
});

describe("skill version detection", () => {
  test("parses the stamped frontmatter version", () => {
    expect(parseSkillVersion("---\nname: liebstoeckel-deck\nversion: 0.3.4\n---\nbody")).toBe("0.3.4");
    expect(parseSkillVersion("no frontmatter here")).toBeNull();
  });

  test("reads the version from any installed agent path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lst-skillver-"));
    try {
      expect(await installedSkillVersion(dir)).toBeNull();
      const skillDir = join(dir, ".claude", "skills", "liebstoeckel-deck");
      mkdirSync(skillDir, { recursive: true });
      await Bun.write(join(skillDir, "SKILL.md"), "---\nname: liebstoeckel-deck\nversion: 0.2.0\n---\n");
      expect(await installedSkillVersion(dir)).toBe("0.2.0");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
