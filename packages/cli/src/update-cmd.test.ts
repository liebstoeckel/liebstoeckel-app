import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { bunGlobalDir, cliInstallRoot, duplicateScopeVersions, planUpdate } from "./update-cmd";

const GLOBAL = "/home/u/.bun/install/global";
const inGlobal = join(GLOBAL, "node_modules", "@liebstoeckel", "cli", "src", "update-cmd.ts");
const inDeck = "/work/deck/node_modules/@liebstoeckel/cli/src/update-cmd.ts";
const none = { hostRoot: null, hostDeps: [], unmanagedCli: null };

describe("planUpdate (pure)", () => {
  test("deck-local: exactly the declared @liebstoeckel/* deps, sorted, scope-filtered", () => {
    const plan = planUpdate({
      deckPkg: {
        dependencies: { "@liebstoeckel/engine": "^0.3.0", react: "^19.0.0", "@liebstoeckel/cli": "^0.3.0" },
        devDependencies: { "@liebstoeckel/thumbnails": "^0.2.0", typescript: "^5.0.0" },
      },
      cliSrcPath: inDeck,
      globalDir: GLOBAL,
    });
    expect(plan).toEqual({
      deckDeps: ["@liebstoeckel/cli", "@liebstoeckel/engine", "@liebstoeckel/thumbnails"],
      global: false,
      ...none,
    });
  });

  test("global-only: no deck deps, CLI under Bun's global dir", () => {
    const plan = planUpdate({ deckPkg: null, cliSrcPath: inGlobal, globalDir: GLOBAL });
    expect(plan).toEqual({ deckDeps: [], global: true, ...none });
  });

  test("both shapes at once", () => {
    const plan = planUpdate({
      deckPkg: { dependencies: { "@liebstoeckel/engine": "^0.3.0" } },
      cliSrcPath: inGlobal,
      globalDir: GLOBAL,
    });
    expect(plan).toEqual({ deckDeps: ["@liebstoeckel/engine"], global: true, ...none });
  });

  test("scaffold shape: the CLI's own install root updates too, ending the nag loop", () => {
    const plan = planUpdate({
      deckPkg: { dependencies: { "@liebstoeckel/engine": "^0.3.0" } }, // deck does NOT declare cli
      cliSrcPath: "/work/proj/node_modules/@liebstoeckel/cli/src/update-cmd.ts",
      globalDir: GLOBAL,
      deckRoot: "/work/proj/my-deck",
      hostRoot: "/work/proj",
      hostPkg: { dependencies: { "@liebstoeckel/cli": "^0.3.0" } },
    });
    expect(plan).toEqual({
      deckDeps: ["@liebstoeckel/engine"],
      global: false,
      hostRoot: "/work/proj",
      hostDeps: ["@liebstoeckel/cli"],
      unmanagedCli: null,
    });
  });

  test("hostRoot equal to the deck collapses into the deck shape", () => {
    const plan = planUpdate({
      deckPkg: { dependencies: { "@liebstoeckel/cli": "^0.3.0" } },
      cliSrcPath: inDeck,
      globalDir: GLOBAL,
      deckRoot: "/work/deck",
      hostRoot: "/work/deck",
      hostPkg: { dependencies: { "@liebstoeckel/cli": "^0.3.0" } },
    });
    expect(plan).toEqual({ deckDeps: ["@liebstoeckel/cli"], global: false, ...none });
  });

  test("a CLI install this command cannot update yields the honest warning, not silence", () => {
    const plan = planUpdate({
      deckPkg: { dependencies: { "@liebstoeckel/engine": "^0.3.0" } },
      cliSrcPath: "/work/proj/node_modules/@liebstoeckel/cli/src/update-cmd.ts",
      globalDir: GLOBAL,
      deckRoot: "/work/proj/my-deck",
      hostRoot: "/work/proj",
      hostPkg: { dependencies: { react: "^19.0.0" } }, // root does not declare the cli
    });
    expect(plan).toMatchObject({ deckDeps: ["@liebstoeckel/engine"], hostDeps: [] });
    expect((plan as { unmanagedCli: string | null }).unmanagedCli).toContain("not managed");
  });

  test("nothing anywhere to act on is a clear error", () => {
    const plan = planUpdate({
      deckPkg: { dependencies: { react: "^19.0.0" } },
      cliSrcPath: "/work/somewhere/cli.ts",
      globalDir: GLOBAL,
    });
    expect(plan).toHaveProperty("error");
  });

  test("a lookalike prefix outside the global dir does not count as global", () => {
    const plan = planUpdate({
      deckPkg: null,
      cliSrcPath: GLOBAL + "-backup/cli/src/update-cmd.ts",
      globalDir: GLOBAL,
    });
    expect(plan).toHaveProperty("error");
  });
});

describe("cliInstallRoot (pure)", () => {
  test("a node_modules install maps to its project root", () => {
    expect(cliInstallRoot("/work/proj/node_modules/@liebstoeckel/cli/src/update-cmd.ts")).toBe("/work/proj");
  });
  test("nested installs map to the innermost owning root", () => {
    expect(cliInstallRoot("/a/node_modules/x/node_modules/@liebstoeckel/cli/src/cli.ts")).toBe("/a/node_modules/x");
  });
  test("a repo checkout (no node_modules segment) is null", () => {
    expect(cliInstallRoot("/home/dev/present-it/packages/cli/src/update-cmd.ts")).toBeNull();
  });
});

describe("duplicateScopeVersions (pure)", () => {
  test("flags a name resolved to two versions, ignores clean names", () => {
    const dups = duplicateScopeVersions([
      { name: "@liebstoeckel/engine", version: "0.3.10" },
      { name: "@liebstoeckel/engine", version: "0.3.8" },
      { name: "@liebstoeckel/theme", version: "0.3.3" },
    ]);
    expect([...dups.entries()]).toEqual([["@liebstoeckel/engine", ["0.3.10", "0.3.8"]]]);
  });

  test("the same version seen twice (hoisted + nested share) is not a duplicate", () => {
    const dups = duplicateScopeVersions([
      { name: "@liebstoeckel/engine", version: "0.3.10" },
      { name: "@liebstoeckel/engine", version: "0.3.10" },
    ]);
    expect(dups.size).toBe(0);
  });

  test("empty input is clean", () => {
    expect(duplicateScopeVersions([]).size).toBe(0);
  });
});

describe("bunGlobalDir (pure)", () => {
  test("honours BUN_INSTALL, falls back to ~/.bun", () => {
    expect(bunGlobalDir({ BUN_INSTALL: "/opt/bun" })).toBe(join("/opt/bun", "install", "global"));
    expect(bunGlobalDir({ HOME: "/home/u" })).toBe(join("/home/u", ".bun", "install", "global"));
  });
});
