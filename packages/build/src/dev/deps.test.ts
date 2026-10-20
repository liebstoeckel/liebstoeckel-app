import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deckTree } from "../profile.ts";
import { prebuildDeps, unresolvedProblem } from "./deps.ts";

const root = mkdtempSync(join(tmpdir(), "lst-deps-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("the dependency prebuild", () => {
  test("names what the deck imports but has not installed, and picks it up once installed", async () => {
    const deck = join(root, "deck");
    mkdirSync(deck, { recursive: true });
    writeFileSync(join(deck, "package.json"), JSON.stringify({ name: "d", private: true, type: "module" }));
    writeFileSync(join(deck, "bun.lock"), "");
    const cache = join(root, "cache");
    const first = await prebuildDeps(deckTree(deck), ["tiny-dep"], cache);
    expect(first.unresolved).toEqual(["tiny-dep"]);
    expect(unresolvedProblem(first.unresolved)).toContain('Could not resolve "tiny-dep" from the deck');
    expect(unresolvedProblem(first.unresolved)).toContain("liebstoeckel install");

    // Installed now: the cached prebuild no longer holds.
    mkdirSync(join(deck, "node_modules", "tiny-dep"), { recursive: true });
    writeFileSync(join(deck, "node_modules", "tiny-dep", "package.json"), JSON.stringify({ name: "tiny-dep", version: "1.0.0", type: "module", main: "index.js" }));
    writeFileSync(join(deck, "node_modules", "tiny-dep", "index.js"), "export const x = 1;\n");
    const second = await prebuildDeps(deckTree(deck), ["tiny-dep"], cache);
    expect(second.cached).toBe(false);
    expect(second.unresolved).toEqual([]);
    expect(unresolvedProblem(second.unresolved)).toBeNull();
  });
});

describe("hasDefaultExport", () => {
  test("sees a default re-export the way plugin packages write it", async () => {
    const { hasDefaultExport } = await import("./deps.ts");
    expect(hasDefaultExport('export { default } from "./client";\nexport { pollSchema } from "./logic";')).toBe(true);
    expect(hasDefaultExport('export { a, default } from "./client";')).toBe(true);
    expect(hasDefaultExport("const x = 1;\nexport { x as default };")).toBe(true);
    expect(hasDefaultExport("export default function A() {}")).toBe(true);
    expect(hasDefaultExport('export { default as Poll } from "./client";')).toBe(false);
    expect(hasDefaultExport('export type { default } from "./types";')).toBe(false);
    expect(hasDefaultExport('export { type default as T } from "./types";')).toBe(false);
    expect(hasDefaultExport('export * from "./a";')).toBe(false);
  });
});
