import { afterEach, beforeEach, test, expect, describe } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  checkIntervalMs,
  compareVersions,
  isNewer,
  shouldRefresh,
  remindersEnabled,
  parseSkillVersion,
  installedSkillVersion,
  healSkills,
  updateReminder,
  type CheckState,
} from "./update";

/** Run a reminder with stderr captured + the interactive/agent gate forced, then
 *  restore everything. Returns the joined stderr the user would have seen. */
async function captureReminder(
  fn: () => Promise<void>,
  opts: { tty?: boolean; env?: Record<string, string | undefined> } = {},
): Promise<string> {
  const out: string[] = [];
  const origErr = console.error;
  const origTty = process.stderr.isTTY;
  const restore: Array<[string, string | undefined]> = [
    ["CI", process.env.CI],
    ["LIEBSTOECKEL_NO_UPDATE_CHECK", process.env.LIEBSTOECKEL_NO_UPDATE_CHECK],
  ];
  console.error = (...a: unknown[]) => void out.push(a.map(String).join(" "));
  try {
    (process.stderr as { isTTY?: boolean }).isTTY = opts.tty ?? true;
    delete process.env.CI;
    delete process.env.LIEBSTOECKEL_NO_UPDATE_CHECK;
    for (const [k, v] of Object.entries(opts.env ?? {})) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await fn();
  } finally {
    console.error = origErr;
    (process.stderr as { isTTY?: boolean }).isTTY = origTty;
    for (const [k, v] of restore) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
  return out.join("\n");
}

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
  const HOUR = 60 * 60 * 1000;
  const state = (ago: number): CheckState => ({ checkedAt: 1_000_000_000_000 - ago, latest: "1.0.0" });
  const NOW = 1_000_000_000_000;

  test("no cache → refresh", () => {
    expect(shouldRefresh(null, NOW)).toBe(true);
  });
  test("fresh cache → no refresh (default interval is 1h)", () => {
    expect(shouldRefresh(state(HOUR / 2), NOW)).toBe(false);
  });
  test("expired cache → refresh", () => {
    expect(shouldRefresh(state(HOUR + 1), NOW)).toBe(true);
  });
  test("clock went backwards → refresh", () => {
    expect(shouldRefresh({ checkedAt: NOW + HOUR, latest: null }, NOW)).toBe(true);
  });
  test("an explicit interval overrides the default", () => {
    expect(shouldRefresh(state(HOUR + 1), NOW, 2 * HOUR)).toBe(false);
    expect(shouldRefresh(state(HOUR / 2), NOW, HOUR / 4)).toBe(true);
  });
});

describe("checkIntervalMs (pure)", () => {
  const HOUR = 60 * 60 * 1000;
  test("defaults to 1h", () => {
    expect(checkIntervalMs({})).toBe(HOUR);
  });
  test("LIEBSTOECKEL_UPDATE_CHECK_INTERVAL is in seconds", () => {
    expect(checkIntervalMs({ LIEBSTOECKEL_UPDATE_CHECK_INTERVAL: "120" })).toBe(120_000);
  });
  test("garbage or non-positive values fall back to the default", () => {
    expect(checkIntervalMs({ LIEBSTOECKEL_UPDATE_CHECK_INTERVAL: "soon" })).toBe(HOUR);
    expect(checkIntervalMs({ LIEBSTOECKEL_UPDATE_CHECK_INTERVAL: "0" })).toBe(HOUR);
    expect(checkIntervalMs({ LIEBSTOECKEL_UPDATE_CHECK_INTERVAL: "-5" })).toBe(HOUR);
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

describe("updateReminder (real message, cache-driven)", () => {
  // The reminder prints from the cache, never a live lookup; a fresh checkedAt also
  // means shouldRefresh is false, so no background `bun pm view` is spawned. We point
  // $HOME at a sandbox so the lazily-resolved cache path lands there.
  let home = "";
  let origHome: string | undefined;
  beforeEach(() => {
    origHome = process.env.HOME;
    home = mkdtempSync(join(tmpdir(), "lst-upd-home-"));
    process.env.HOME = home;
  });
  afterEach(() => {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    rmSync(home, { recursive: true, force: true });
  });
  const seed = (latest: string | null) => {
    const f = join(home, ".config", "liebstoeckel", "update-check.json");
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, JSON.stringify({ checkedAt: Date.now(), latest } satisfies CheckState));
  };

  test("prints the update notice pointing at the update command", async () => {
    seed("99.0.0"); // newer than the CLI's real version
    const out = await captureReminder(() => updateReminder([]), { tty: true });
    expect(out).toContain("@liebstoeckel/cli 99.0.0 is available");
    expect(out).toContain("liebstoeckel update");
  });

  test("silent when the cached latest is not newer", async () => {
    seed("0.0.1");
    expect(await captureReminder(() => updateReminder([]), { tty: true })).toBe("");
  });

  test("silent for agents: --json, a pipe, or CI", async () => {
    seed("99.0.0");
    expect(await captureReminder(() => updateReminder(["build", "--json"]), { tty: true })).toBe("");
    expect(await captureReminder(() => updateReminder([]), { tty: false })).toBe("");
    expect(await captureReminder(() => updateReminder([]), { tty: true, env: { CI: "1" } })).toBe("");
  });
});

describe("healSkills (self-heal, real writes)", () => {
  // Point $HOME at a sandbox so the home-root probe is exercised hermetically.
  let home = "";
  let origHome: string | undefined;
  beforeEach(() => {
    origHome = process.env.HOME;
    home = mkdtempSync(join(tmpdir(), "lst-heal-home-"));
    process.env.HOME = home;
  });
  afterEach(() => {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    rmSync(home, { recursive: true, force: true });
  });

  const withSkill = (root: string, version: string): string => {
    const sd = join(root, ".claude", "skills", "liebstoeckel-deck");
    mkdirSync(sd, { recursive: true });
    writeFileSync(join(sd, "SKILL.md"), `---\nname: liebstoeckel-deck\nversion: ${version}\n---\n`);
    return join(sd, "SKILL.md");
  };

  test("rewrites a stale deck skill in place and announces it, even for a pipe", async () => {
    const deck = mkdtempSync(join(tmpdir(), "lst-heal-deck-"));
    const skillMd = withSkill(deck, "0.0.1");
    try {
      const out = await captureReminder(() => healSkills(deck), { tty: false });
      expect(out).toContain("refreshed the agent skill v0.0.1");
      const current = (await import("./skill")).cliVersion;
      expect(await installedSkillVersion(deck)).toBe(await current());
      expect(await Bun.file(skillMd).text()).toContain("Staying current");
    } finally {
      rmSync(deck, { recursive: true, force: true });
    }
  });

  test("heals a user-scope install under the home dir too", async () => {
    const deck = mkdtempSync(join(tmpdir(), "lst-heal-deck-"));
    withSkill(home, "0.0.1");
    try {
      const out = await captureReminder(() => healSkills(deck), { tty: true });
      expect(out).toContain("refreshed the agent skill v0.0.1");
      expect(await installedSkillVersion(home)).toBe(await (await import("./skill")).cliVersion());
      // A home-root heal never writes AGENTS.md (project convention only).
      expect(existsSync(join(home, "AGENTS.md"))).toBe(false);
    } finally {
      rmSync(deck, { recursive: true, force: true });
    }
  });

  test("no-op when the installed skill is current or absent", async () => {
    const deck = mkdtempSync(join(tmpdir(), "lst-heal-deck-"));
    try {
      expect(await captureReminder(() => healSkills(deck), { tty: true })).toBe("");
      const current = await (await import("./skill")).cliVersion();
      withSkill(deck, current);
      expect(await captureReminder(() => healSkills(deck), { tty: true })).toBe("");
      expect(await installedSkillVersion(deck)).toBe(current);
    } finally {
      rmSync(deck, { recursive: true, force: true });
    }
  });
});
