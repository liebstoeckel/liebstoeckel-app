import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadBatchSnapshot,
  removeBatchSnapshot,
  restoreSnapshot,
  saveBatchSnapshot,
  snapshotFiles,
  withinRoot,
} from "./snapshot";

function deck(): string {
  const dir = mkdtempSync(join(tmpdir(), "lst-dev-snap-"));
  mkdirSync(join(dir, "slides"), { recursive: true });
  writeFileSync(join(dir, "slides", "a.mdx"), "# original\n");
  return dir;
}

describe("withinRoot", () => {
  test("accepts deck-relative, rejects escapes and absolutes outside", () => {
    const root = "/deck";
    expect(withinRoot(root, "slides/a.mdx")).toBe("slides/a.mdx");
    expect(withinRoot(root, "/deck/slides/a.mdx")).toBe("slides/a.mdx");
    expect(withinRoot(root, "../secrets")).toBeNull();
    expect(withinRoot(root, "/etc/passwd")).toBeNull();
    expect(withinRoot(root, "")).toBeNull();
  });
});

describe("snapshot and restore", () => {
  test("round-trip restores edited and deleted files, records missing ones", () => {
    const dir = deck();
    const snap = snapshotFiles(dir, ["slides/a.mdx", "slides/new.mdx", "../escape.txt"]);
    expect(Object.keys(snap).sort()).toEqual(["slides/a.mdx", "slides/new.mdx"]);
    expect(snap["slides/a.mdx"]).toEqual({ exists: true, content: "# original\n" });
    expect(snap["slides/new.mdx"]!.exists).toBe(false);

    // Agent "edits": rewrite one, create the other.
    writeFileSync(join(dir, "slides", "a.mdx"), "# changed\n");
    writeFileSync(join(dir, "slides", "new.mdx"), "# created\n");

    const result = restoreSnapshot(dir, snap);
    expect(result.failures).toEqual([]);
    expect(result.restored.sort()).toEqual(["slides/a.mdx", "slides/new.mdx"]);
    expect(readFileSync(join(dir, "slides", "a.mdx"), "utf-8")).toBe("# original\n");
    expect(existsSync(join(dir, "slides", "new.mdx"))).toBe(false);
  });

  test("restore ignores traversal keys smuggled into a snapshot", () => {
    const dir = deck();
    const result = restoreSnapshot(dir, { "../evil.txt": { exists: true, content: "x" } });
    expect(result.restored).toEqual([]);
    expect(existsSync(join(dir, "..", "evil.txt"))).toBe(false);
  });
});

describe("batch persistence", () => {
  test("save/load/remove; malformed ids refused", () => {
    const dir = deck();
    const snap = snapshotFiles(dir, ["slides/a.mdx"]);
    saveBatchSnapshot(dir, "batch1", snap);
    expect(loadBatchSnapshot(dir, "batch1")).toEqual(snap);
    expect(loadBatchSnapshot(dir, "missing")).toBeNull();
    expect(loadBatchSnapshot(dir, "../../etc")).toBeNull();
    removeBatchSnapshot(dir, "batch1");
    expect(loadBatchSnapshot(dir, "batch1")).toBeNull();
  });
});
