import { describe, expect, test } from "bun:test";
import { playwrightCoreVersion } from "@liebstoeckel/thumbnails";
import { buildReport, installChromiumArgs } from "./doctor";
import { bunBin } from "./bun";

describe("buildReport", () => {
  test("bun.ok reflects whether the version satisfies the range", () => {
    expect(buildReport({ bunVersion: "1.3.14", bunRange: ">=1.3", chromium: null }).bun.ok).toBe(true);
    expect(buildReport({ bunVersion: "1.2.12", bunRange: ">=1.3", chromium: null }).bun.ok).toBe(false);
  });

  test("chromium.ok is true only when a path resolved", () => {
    expect(buildReport({ bunVersion: "1.3.0", bunRange: ">=1.3", chromium: "/usr/bin/chromium" }).chromium).toEqual({
      path: "/usr/bin/chromium",
      ok: true,
    });
    expect(buildReport({ bunVersion: "1.3.0", bunRange: ">=1.3", chromium: null }).chromium).toEqual({
      path: null,
      ok: false,
    });
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
