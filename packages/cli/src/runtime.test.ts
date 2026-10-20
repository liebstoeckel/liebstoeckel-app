import { describe, expect, test } from "bun:test";
import { bunRuntimeFrom, esbuildRuntime, ovenPackageOf, pinnedBunVersion, versionLines } from "./runtime";
import { installArgs } from "./install";
import { bunBin } from "./bun";
import { buildReport, runtimeLines } from "./doctor";
import pkg from "../package.json";

describe("ovenPackageOf", () => {
  test("finds the @oven/bun-* package of a binary, on POSIX and Windows paths", () => {
    expect(ovenPackageOf("/g/node_modules/@oven/bun-linux-x64/bin/bun")).toBe("@oven/bun-linux-x64");
    expect(ovenPackageOf("C:\\g\\node_modules\\@oven\\bun-windows-x64\\bin\\bun.exe")).toBe("@oven/bun-windows-x64");
    expect(ovenPackageOf("/repo/node_modules/.bun/@oven+bun-linux-x64@1.3.14/node_modules/@oven/bun-linux-x64/bin/bun")).toBe("@oven/bun-linux-x64");
    expect(ovenPackageOf("/usr/local/bin/bun")).toBeNull();
    expect(ovenPackageOf("/home/u/.bun/bin/bun")).toBeNull();
  });
});

describe("bunRuntimeFrom", () => {
  test("pinned only for the pinned version inside an @oven package", () => {
    const at = "/g/node_modules/@oven/bun-linux-x64/bin/bun";
    expect(bunRuntimeFrom({ version: "1.3.14", execPath: at, pinned: "1.3.14" }).source).toBe("pinned");
    expect(bunRuntimeFrom({ version: "1.3.13", execPath: at, pinned: "1.3.14" }).source).toBe("other");
    expect(bunRuntimeFrom({ version: "1.3.14", execPath: "/usr/local/bin/bun", pinned: "1.3.14" })).toMatchObject({ source: "other", package: null });
  });

  test("the CLI's package.json pins one version", () => {
    expect(pinnedBunVersion(pkg)).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("versionLines", () => {
  test("first line stays `liebstoeckel <version>`, then Bun and esbuild with their source", () => {
    const bun = bunRuntimeFrom({ version: "1.3.14", execPath: "/g/node_modules/@oven/bun-linux-x64/bin/bun", pinned: "1.3.14" });
    expect(versionLines("0.4.0", bun, { version: "0.28.2", package: "@esbuild/linux-x64", binaryPath: null })).toEqual([
      "liebstoeckel 0.4.0",
      "bun 1.3.14 (pinned, @oven/bun-linux-x64)",
      "esbuild 0.28.2 (@esbuild/linux-x64)",
    ]);
    const other = bunRuntimeFrom({ version: "1.3.14", execPath: "/usr/bin/bun", pinned: "1.3.14" });
    expect(versionLines("0.4.0", other, { version: "0.28.2", package: null, binaryPath: null })[1]).toBe("bun 1.3.14 (/usr/bin/bun, not the CLI's pinned Bun 1.3.14)");
  });

  test("esbuildRuntime resolves the build core's esbuild and its native package here", () => {
    const e = esbuildRuntime();
    expect(e.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(e.package).toBe(`@esbuild/${process.platform}-${process.arch}`);
  });
});

describe("doctor runtime lines", () => {
  const base = { bunVersion: "1.3.14", bunRange: ">=1.3", chromium: null, cliVersion: "0.4.0", latestKnown: null, bunPinned: "1.3.14" };
  test("the pinned Bun is named with its package; another Bun gets a warning", () => {
    const pinned = buildReport({ ...base, bunPath: "/g/node_modules/@oven/bun-linux-x64/bin/bun", esbuild: { version: "0.28.2", package: "@esbuild/linux-x64", binaryPath: null } });
    expect(runtimeLines(pinned)).toEqual(["✓ Bun 1.3.14, the CLI's pinned Bun (@oven/bun-linux-x64)", "✓ esbuild 0.28.2 (@esbuild/linux-x64)"]);
    const other = buildReport({ ...base, bunPath: "/usr/bin/bun", esbuild: { version: "0.28.2", package: null, binaryPath: null } });
    const lines = runtimeLines(other);
    expect(lines[0]).toBe("✓ Bun 1.3.14 (needs >=1.3) at /usr/bin/bun");
    expect(lines[1]).toContain("not the CLI's pinned Bun 1.3.14");
    expect(lines[2]).toContain("native binary package is not installed");
  });
});

test("installArgs: install with no packages, add otherwise, never lifecycle scripts", () => {
  expect(installArgs([], false)).toEqual([bunBin, "install", "--ignore-scripts"]);
  expect(installArgs(["@liebstoeckel/plugin-poll"], false)).toEqual([bunBin, "add", "--ignore-scripts", "@liebstoeckel/plugin-poll"]);
  expect(installArgs(["x"], true)).toEqual([bunBin, "add", "--ignore-scripts", "--dev", "x"]);
});

test("watchShim stops the CLI once the shim is gone, and only then", async () => {
  const { watchShim } = await import("./cli");
  let alive = true;
  let stopped = 0;
  watchShim(1, () => alive, () => stopped++, 20);
  await Bun.sleep(80);
  expect(stopped).toBe(0);
  alive = false;
  await Bun.sleep(80);
  expect(stopped).toBe(1);
});
