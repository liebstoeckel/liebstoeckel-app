import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { playwrightCoreVersion } from "@liebstoeckel/thumbnails";
import { buildReport, diagnosticExitCode, installChromiumArgs } from "./doctor";
import { bunBin } from "./bun";
import { runAutoPatches, type MigrationStatus } from "./migrations";

const base = { bunVersion: "1.3.14", bunRange: ">=1.3", chromium: null, cliVersion: "0.3.0", latestKnown: null };

describe("buildReport", () => {
  test("bun.ok reflects whether the version satisfies the range", () => {
    expect(buildReport(base).bun.ok).toBe(true);
    expect(buildReport({ ...base, bunVersion: "1.2.12" }).bun.ok).toBe(false);
  });

  test("chromium.ok is true only when a path resolved", () => {
    expect(buildReport({ ...base, chromium: "/usr/bin/chromium" }).chromium).toEqual({
      path: "/usr/bin/chromium",
      ok: true,
    });
    expect(buildReport(base).chromium).toEqual({ path: null, ok: false });
  });

  test("cli.updateAvailable only when the cached latest is strictly newer", () => {
    expect(buildReport({ ...base, latestKnown: "0.4.0" }).cli).toEqual({
      version: "0.3.0",
      latestKnown: "0.4.0",
      updateAvailable: true,
    });
    expect(buildReport({ ...base, latestKnown: "0.3.0" }).cli.updateAvailable).toBe(false);
    expect(buildReport({ ...base, latestKnown: "0.2.9" }).cli.updateAvailable).toBe(false);
  });

  test("no cache / failed check (latest null, e.g. offline) never claims an update", () => {
    expect(buildReport(base).cli).toEqual({ version: "0.3.0", latestKnown: null, updateAvailable: false });
  });
});

describe("diagnosticExitCode", () => {
  const report = (bunOk: boolean, chromiumOk: boolean): Parameters<typeof diagnosticExitCode>[0] => ({
    bun: { version: "1.3.14", required: ">=1.3", ok: bunOk },
    chromium: { path: chromiumOk ? "/usr/bin/chromium" : null, ok: chromiumOk },
    cli: { version: "0.3.0", latestKnown: null, updateAvailable: false },
    configFile: "/tmp/config.json",
  });

  test("non-zero when Bun is unsatisfied (gateable by CI/agents)", () => {
    expect(diagnosticExitCode(report(false, true))).not.toBe(0);
    expect(diagnosticExitCode(report(false, false))).not.toBe(0);
  });

  test("zero when Bun is fine, even with no Chromium (Chromium is optional)", () => {
    expect(diagnosticExitCode(report(true, true))).toBe(0);
    expect(diagnosticExitCode(report(true, false))).toBe(0);
  });
});

describe("installChromiumArgs", () => {
  // Regression: an unpinned `playwright install` resolves to registry-latest and
  // drops a Chromium revision the pinned playwright-core can't find, so the install
  // "succeeds" yet `resolveChromium()` still returns nothing. The version MUST be
  // pinned to the playwright-core the capturer launches through.
  test("pins playwright to the resolved playwright-core version", () => {
    const args = installChromiumArgs();
    expect(args).toContain(`playwright@${playwrightCoreVersion}`);
    // never the bare, registry-latest form
    expect(args).not.toContain("playwright");
    expect(args.slice(1)).toEqual(["x", `playwright@${playwrightCoreVersion}`, "install", "chromium"]);
  });

  test("runs through the Bun interpreting this CLI (bunBin), not a bare PATH bun", () => {
    expect(installChromiumArgs()[0]).toBe(bunBin);
    expect(bunBin).toBe(process.execPath);
  });
});

describe("doctor --json migrations surface", () => {
  let tmp: string | null = null;
  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
    tmp = null;
  });

  /** Run the real CLI (network checks off, HOME sandboxed) and parse stdout. */
  function doctorJson(deckDir: string): { migrations: MigrationStatus[]; migrationWarnings: string[] } {
    const res = Bun.spawnSync([process.execPath, join(import.meta.dir, "cli.ts"), "doctor", "--json", "--dir", deckDir], {
      env: { ...process.env, LIEBSTOECKEL_NO_UPDATE_CHECK: "1", HOME: tmp! },
    });
    return JSON.parse(res.stdout.toString());
  }

  test("a pre-dev-mode deck reports both seeds needed and autoPatchable; a current scaffold reports none needed", () => {
    tmp = mkdtempSync(join(tmpdir(), "pi-doctor-"));
    const deck = join(tmp, "deck");
    mkdirSync(deck, { recursive: true });
    writeFileSync(join(deck, "package.json"), JSON.stringify({ name: "deck" }));
    writeFileSync(
      join(deck, "index.html"),
      `<html><head></head><body><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>`,
    );
    writeFileSync(join(deck, "main.tsx"), `import { createRoot } from "react-dom/client";\ncreateRoot(document.getElementById("root")!).render(<A />);\n`);

    const stale = doctorJson(deck);
    expect(stale.migrationWarnings).toEqual([]);
    expect(stale.migrations.map((m) => [m.id, m.needed, m.autoPatchable])).toEqual([
      ["0001-hmr-entry-boundary", true, true],
      ["0002-dev-loader-tag", true, true],
    ]);

    // migrate it (what `dev` boot does), then doctor reports clean
    runAutoPatches(deck, ["entry", "index.html"]);
    const fresh = doctorJson(deck);
    expect(fresh.migrations.every((m) => !m.needed)).toBe(true);
  });

  test("a suppressed migration stays in --json with its reason; outside a deck the array is empty", () => {
    tmp = mkdtempSync(join(tmpdir(), "pi-doctor-"));
    const deck = join(tmp, "deck");
    mkdirSync(deck, { recursive: true });
    writeFileSync(
      join(deck, "package.json"),
      JSON.stringify({ name: "deck", liebstoeckel: { migrationOptOut: { "0002-dev-loader-tag": "no dev mode here", "typo-id": "x" } } }),
    );
    writeFileSync(join(deck, "index.html"), `<html><head></head><body><div id="root"></div></body></html>`);

    const out = doctorJson(deck);
    const tag = out.migrations.find((m) => m.id === "0002-dev-loader-tag")!;
    expect(tag).toMatchObject({ needed: false, suppressed: true, suppressReason: "no dev mode here" });
    expect(out.migrationWarnings.join("\n")).toContain("typo-id");

    expect(doctorJson(tmp).migrations).toEqual([]);
  });
});
