import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { binaryIn, bunCandidates, bunProblem, installKind, PRIMARY, pinnedVersion, problemJson, problemText, spawnProblem, wantsJson } from "./resolve-bun.js";

const pkg = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")) as { optionalDependencies: Record<string, string> };

describe("bunCandidates", () => {
  test("the default build per platform, an installed baseline build first on x64", () => {
    expect(bunCandidates({ platform: "linux", arch: "x64", musl: false })).toEqual({
      candidates: ["@oven/bun-linux-x64-baseline", "@oven/bun-linux-x64"],
      needs: null,
    });
    expect(bunCandidates({ platform: "linux", arch: "arm64", musl: false })).toEqual({ candidates: ["@oven/bun-linux-aarch64"], needs: null });
    expect(bunCandidates({ platform: "darwin", arch: "arm64", musl: false })).toEqual({ candidates: ["@oven/bun-darwin-aarch64"], needs: null });
    expect(bunCandidates({ platform: "darwin", arch: "x64", musl: false }).candidates).toEqual(["@oven/bun-darwin-x64-baseline", "@oven/bun-darwin-x64"]);
    expect(bunCandidates({ platform: "win32", arch: "x64", musl: false }).candidates).toEqual(["@oven/bun-windows-x64-baseline", "@oven/bun-windows-x64"]);
    expect(bunCandidates({ platform: "win32", arch: "arm64", musl: false }).candidates).toEqual(["@oven/bun-windows-aarch64"]);
  });

  test("musl Linux only takes musl builds and says which one it needs", () => {
    expect(bunCandidates({ platform: "linux", arch: "x64", musl: true })).toEqual({
      candidates: ["@oven/bun-linux-x64-musl", "@oven/bun-linux-x64-musl-baseline"],
      needs: "@oven/bun-linux-x64-musl",
    });
    expect(bunCandidates({ platform: "linux", arch: "arm64", musl: true })).toEqual({
      candidates: ["@oven/bun-linux-aarch64-musl"],
      needs: "@oven/bun-linux-aarch64-musl",
    });
  });

  test("FreeBSD and Android need their own build; anything else has none", () => {
    expect(bunCandidates({ platform: "freebsd", arch: "x64", musl: false }).needs).toBe("@oven/bun-freebsd-x64");
    expect(bunCandidates({ platform: "android", arch: "arm64", musl: false }).needs).toBe("@oven/bun-linux-aarch64-android");
    expect(bunCandidates({ platform: "linux", arch: "ia32", musl: false })).toEqual({ candidates: [], needs: null });
    expect(bunCandidates({ platform: "sunos", arch: "x64", musl: false })).toEqual({ candidates: [], needs: null });
  });

  test("every default package is an optional dependency of the CLI, and nothing else of Oven's is", () => {
    const listed = Object.keys(pkg.optionalDependencies).filter((n) => n.startsWith("@oven/")).sort();
    expect(listed).toEqual(Object.values(PRIMARY).sort());
  });
});

describe("pinnedVersion", () => {
  test("the CLI pins one exact Bun version", () => {
    expect(pinnedVersion(pkg)).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("disagreeing, ranged or missing pins are no pin", () => {
    expect(pinnedVersion({ optionalDependencies: { "@oven/bun-linux-x64": "1.3.14", "@oven/bun-darwin-x64": "1.3.13" } })).toBeNull();
    expect(pinnedVersion({ optionalDependencies: { "@oven/bun-linux-x64": "^1.3.14" } })).toBeNull();
    expect(pinnedVersion({})).toBeNull();
  });
});

test("binaryIn names bun.exe on Windows only", () => {
  expect(binaryIn("/n/@oven/bun-linux-x64", "linux")).toBe("/n/@oven/bun-linux-x64/bin/bun");
  expect(binaryIn("C:\\n\\@oven\\bun-windows-x64", "win32")).toBe("C:\\n\\@oven\\bun-windows-x64/bin/bun.exe");
});

describe("installKind", () => {
  test("recognizes the usual install locations", () => {
    expect(installKind("/home/u/.bun/install/global/node_modules/@liebstoeckel/cli")).toBe("bun-global");
    expect(installKind("/usr/local/lib/node_modules/@liebstoeckel/cli")).toBe("npm-global");
    expect(installKind("C:\\Users\\u\\AppData\\Roaming\\npm\\node_modules\\@liebstoeckel\\cli")).toBe("npm-global");
    expect(installKind("/home/u/.npm/_npx/1a2b/node_modules/@liebstoeckel/cli")).toBe("npx");
    expect(installKind("/tmp/bunx-1000-@liebstoeckel/cli@latest/node_modules/@liebstoeckel/cli")).toBe("bunx");
    expect(installKind("/home/u/talk/node_modules/@liebstoeckel/cli")).toBe("local");
  });
});

describe("bunProblem", () => {
  const base = { platform: "linux", arch: "x64", musl: false, version: "1.3.14", needs: null, found: null, empty: null };

  test("skipped optional dependencies: names the package and the reinstall", () => {
    const p = bunProblem({ ...base, tried: ["@oven/bun-linux-x64-baseline", "@oven/bun-linux-x64"], kind: "npm-global" });
    expect(p.code).toBe("bun_missing");
    expect(p.details.join(" ")).toContain("@oven/bun-linux-x64@1.3.14");
    expect(p.details.join(" ")).toContain("--omit=optional");
    expect(p.fix).toBe("npm install -g @liebstoeckel/cli");
  });

  test("musl: names the variant at the pinned version, installed next to the CLI", () => {
    const p = bunProblem({ ...base, musl: true, tried: ["@oven/bun-linux-x64-musl", "@oven/bun-linux-x64-musl-baseline"], needs: "@oven/bun-linux-x64-musl", kind: "npm-global" });
    expect(p.code).toBe("bun_variant_missing");
    expect(p.fix).toBe("npm install -g @liebstoeckel/cli @oven/bun-linux-x64-musl@1.3.14");
    expect(bunProblem({ ...base, musl: true, tried: ["@oven/bun-linux-x64-musl"], needs: "@oven/bun-linux-x64-musl", kind: "local" }).fix).toContain(
      "npm install --save-dev @oven/bun-linux-x64-musl@1.3.14",
    );
  });

  test("a stale variant after an update: reinstall it at the new pin", () => {
    const p = bunProblem({ ...base, musl: true, tried: ["@oven/bun-linux-x64-musl"], needs: "@oven/bun-linux-x64-musl", kind: "bun-global", found: { pkg: "@oven/bun-linux-x64-musl", version: "1.3.13" } });
    expect(p.code).toBe("bun_version_mismatch");
    expect(p.details[0]).toContain("1.3.13");
    expect(p.fix).toBe("bun add -g @liebstoeckel/cli @oven/bun-linux-x64-musl@1.3.14");
  });

  test("an installed package without its binary, an unsupported machine, a broken pin", () => {
    expect(bunProblem({ ...base, tried: ["@oven/bun-linux-x64"], kind: "local", empty: "/n/bin/bun" }).code).toBe("bun_binary_missing");
    expect(bunProblem({ ...base, arch: "ia32", tried: [], kind: "local" }).code).toBe("bun_unsupported_platform");
    expect(bunProblem({ ...base, version: null, tried: ["@oven/bun-linux-x64"], kind: "local" }).code).toBe("bun_pin_broken");
  });

  test("prose for stderr, the CLI's error document for --json", () => {
    const p = bunProblem({ ...base, tried: ["@oven/bun-linux-x64"], kind: "npm-global" });
    expect(problemText(p)).toStartWith("liebstoeckel: the Bun runtime this CLI runs on is not installed.\n");
    expect(problemText(p)).toContain("  fix: npm install -g @liebstoeckel/cli\n");
    expect(JSON.parse(problemJson(p))).toMatchObject({ ok: false, code: "bun_missing", hint: "npm install -g @liebstoeckel/cli" });
    expect(problemText(spawnProblem("/n/bin/bun", Object.assign(new Error("spawn EACCES"), { code: "EACCES" })))).toContain("(EACCES)");
  });

  test("JSON only on an explicit --json", () => {
    expect(wantsJson(["build", "--json"])).toBe(true);
    expect(wantsJson(["build"])).toBe(false);
    expect(wantsJson(["build", "--json", "--no-json"])).toBe(false);
  });
});
