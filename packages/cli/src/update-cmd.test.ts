import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { bunGlobalDir, planUpdate } from "./update-cmd";

const GLOBAL = "/home/u/.bun/install/global";
const inGlobal = join(GLOBAL, "node_modules", "@liebstoeckel", "cli", "src", "update-cmd.ts");
const inDeck = "/work/deck/node_modules/@liebstoeckel/cli/src/update-cmd.ts";

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
    });
  });

  test("global-only: no deck deps, CLI under Bun's global dir", () => {
    const plan = planUpdate({ deckPkg: null, cliSrcPath: inGlobal, globalDir: GLOBAL });
    expect(plan).toEqual({ deckDeps: [], global: true });
  });

  test("both shapes at once", () => {
    const plan = planUpdate({
      deckPkg: { dependencies: { "@liebstoeckel/engine": "^0.3.0" } },
      cliSrcPath: inGlobal,
      globalDir: GLOBAL,
    });
    expect(plan).toEqual({ deckDeps: ["@liebstoeckel/engine"], global: true });
  });

  test("a deck with no scope deps and a non-global CLI is a clear error", () => {
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
      cliSrcPath: GLOBAL + "-backup/node_modules/@liebstoeckel/cli/src/update-cmd.ts",
      globalDir: GLOBAL,
    });
    expect(plan).toHaveProperty("error");
  });
});

describe("bunGlobalDir (pure)", () => {
  test("honours BUN_INSTALL, falls back to ~/.bun", () => {
    expect(bunGlobalDir({ BUN_INSTALL: "/opt/bun" })).toBe(join("/opt/bun", "install", "global"));
    expect(bunGlobalDir({ HOME: "/home/u" })).toBe(join("/home/u", ".bun", "install", "global"));
  });
});
