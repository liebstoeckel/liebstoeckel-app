import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectRoot } from "./disk.ts";

const root = realpathSync(mkdtempSync(join(tmpdir(), "lst-root-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const write = (p: string, text = "") => {
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, text);
};

describe("projectRoot", () => {
  test("a deck with its own lockfile is its own root", () => {
    write(join(root, "solo", "bun.lock"));
    expect(projectRoot(join(root, "solo"))).toBe(join(root, "solo"));
  });

  test("a deck without a lockfile uses the nearest one above", () => {
    write(join(root, "repo", "bun.lock"));
    mkdirSync(join(root, "repo", "talks", "a"), { recursive: true });
    expect(projectRoot(join(root, "repo", "talks", "a"))).toBe(join(root, "repo"));
  });

  test("a workspace member keeps the workspace root even with a lockfile of its own", () => {
    write(join(root, "mono", "bun.lock"));
    write(join(root, "mono", "package.json"), JSON.stringify({ private: true, workspaces: ["decks/*"] }));
    write(join(root, "mono", "decks", "talk", "bun.lock"));
    expect(projectRoot(join(root, "mono", "decks", "talk"))).toBe(join(root, "mono"));
  });

  test("a deck that is not a member stays its own root", () => {
    write(join(root, "app", "bun.lock"));
    write(join(root, "app", "package.json"), JSON.stringify({ private: true, workspaces: ["packages/*"] }));
    write(join(root, "app", "talks", "x", "bun.lock"));
    expect(projectRoot(join(root, "app", "talks", "x"))).toBe(join(root, "app", "talks", "x"));
  });
});
