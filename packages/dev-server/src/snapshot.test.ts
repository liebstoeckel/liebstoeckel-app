import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  batchesDispatchedAfter,
  insideRootReal,
  listDeckFiles,
  listDeckSources,
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

  test("returns forward slashes whatever the platform separator, so it matches the deck listing", () => {
    // On win32 `relative` yields backslashes while `listDeckFiles` builds
    // paths with `/`; a mismatch there would make every subdirectory file
    // look "created" and get deleted on revert.
    expect(withinRoot("/deck", join("slides", "a.mdx"))).toBe("slides/a.mdx");
    expect(withinRoot("/deck", join("/deck", "assets", "logo.png"))).toBe("assets/logo.png");
  });
});

describe("insideRootReal", () => {
  test("follows symlinks: a path through a linked directory outside the deck is refused, a new file under a real dir is fine", () => {
    const outside = mkdtempSync(join(tmpdir(), "lst-dev-outside-"));
    writeFileSync(join(outside, "theme.css"), "body{}\n");
    const dir = deck();
    symlinkSync(outside, join(dir, "shared"), "dir");
    symlinkSync(join(outside, "theme.css"), join(dir, "linked.css"), "file");
    expect(insideRootReal(dir, "slides/a.mdx")).toBe(true);
    expect(insideRootReal(dir, "slides/not-yet.mdx")).toBe(true);
    expect(insideRootReal(dir, "brand/new/dir/x.mdx")).toBe(true);
    expect(insideRootReal(dir, "shared/theme.css")).toBe(false);
    expect(insideRootReal(dir, "shared/new.css")).toBe(false);
    expect(insideRootReal(dir, "linked.css")).toBe(false);
    // A symlinked directory is invisible to the listing, so it is never in a
    // batch's existence record either.
    expect(listDeckFiles(dir)).toEqual(["slides/a.mdx"]);
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

  test("snapshot and restore never write or delete through a symlink that leaves the deck", () => {
    const outside = mkdtempSync(join(tmpdir(), "lst-dev-outside-"));
    writeFileSync(join(outside, "theme.css"), "ORIGINAL\n");
    const dir = deck();
    symlinkSync(outside, join(dir, "shared"), "dir");
    // Referenced by attribution: not snapshotted, since it is not the deck's.
    expect(Object.keys(snapshotFiles(dir, ["shared/theme.css", "slides/a.mdx"]))).toEqual(["slides/a.mdx"]);
    // A record that names it anyway (the link appeared after dispatch) is skipped, not followed.
    const result = restoreSnapshot(dir, {
      "shared/theme.css": { exists: false, content: "" },
      "shared/other.css": { exists: true, content: "x" },
    });
    expect(result.restored).toEqual([]);
    expect(result.failures).toEqual([]);
    expect(result.skipped.sort()).toEqual(["shared/other.css", "shared/theme.css"]);
    expect(readFileSync(join(outside, "theme.css"), "utf-8")).toBe("ORIGINAL\n");
    expect(existsSync(join(outside, "other.css"))).toBe(false);
  });
});

describe("batch persistence", () => {
  test("save/load/remove; malformed ids refused", () => {
    const dir = deck();
    const snap = snapshotFiles(dir, ["slides/a.mdx"]);
    saveBatchSnapshot(dir, "batch1", { files: snap, existed: ["slides/a.mdx"] });
    expect(loadBatchSnapshot(dir, "batch1")).toEqual({ files: snap, existed: ["slides/a.mdx"] });
    expect(loadBatchSnapshot(dir, "missing")).toBeNull();
    expect(loadBatchSnapshot(dir, "../../etc")).toBeNull();
    removeBatchSnapshot(dir, "batch1");
    expect(loadBatchSnapshot(dir, "batch1")).toBeNull();
  });

  test("dispatch time round-trips and orders batches", () => {
    const dir = deck();
    const snap = snapshotFiles(dir, ["slides/a.mdx"]);
    saveBatchSnapshot(dir, "old", { files: snap, existed: [], dispatchedAt: 100 });
    saveBatchSnapshot(dir, "mid", { files: snap, existed: [], dispatchedAt: 200 });
    saveBatchSnapshot(dir, "new", { files: snap, existed: [], dispatchedAt: 300 });
    saveBatchSnapshot(dir, "undated", { files: snap, existed: [] });
    expect(loadBatchSnapshot(dir, "mid")!.dispatchedAt).toBe(200);
    expect(loadBatchSnapshot(dir, "undated")!.dispatchedAt).toBeUndefined();
    expect(batchesDispatchedAfter(dir, "old")).toEqual(["mid", "new"]);
    expect(batchesDispatchedAfter(dir, "new")).toEqual([]);
    expect(batchesDispatchedAfter(dir, "undated")).toEqual([]);
  });

  test("a flat pre-manifest snapshot file loads with no existence record", () => {
    const dir = deck();
    mkdirSync(join(dir, ".liebstoeckel", "dev", "snapshots"), { recursive: true });
    writeFileSync(
      join(dir, ".liebstoeckel", "dev", "snapshots", "old.json"),
      JSON.stringify({ "slides/a.mdx": { exists: true, content: "x" } }),
    );
    expect(loadBatchSnapshot(dir, "old")).toEqual({ files: { "slides/a.mdx": { exists: true, content: "x" } }, existed: null });
  });
});

describe("deck file listing", () => {
  test("lists every file except dependency, build, and dev-state dirs; sources filter by extension and size", () => {
    const dir = deck();
    mkdirSync(join(dir, "node_modules", "x"), { recursive: true });
    writeFileSync(join(dir, "node_modules", "x", "index.js"), "");
    mkdirSync(join(dir, ".liebstoeckel", "dev"), { recursive: true });
    writeFileSync(join(dir, ".liebstoeckel", "dev", "annotations.json"), "{}");
    mkdirSync(join(dir, "dist"), { recursive: true });
    writeFileSync(join(dir, "dist", "deck.html"), "");
    writeFileSync(join(dir, "main.tsx"), "");
    writeFileSync(join(dir, "logo.png"), "");
    writeFileSync(join(dir, "big.mdx"), "x".repeat(600 * 1024));
    const all = listDeckFiles(dir);
    expect(all).toEqual(["big.mdx", "logo.png", "main.tsx", "slides/a.mdx"]);
    expect(listDeckSources(dir, all)).toEqual(["main.tsx", "slides/a.mdx"]);
  });
});

describe("pruneBatchSnapshots", () => {
  test("keeps the newest records and removes the rest", async () => {
    const deck = mkdtempSync(join(tmpdir(), "lst-prune-"));
    const { pruneBatchSnapshots } = await import("./snapshot");
    const { utimesSync } = await import("node:fs");
    for (let i = 0; i < 5; i++) {
      saveBatchSnapshot(deck, `b${i}`, { files: {}, existed: [] });
      // Deterministic mtimes; b4 is newest.
      const t = new Date(2026, 0, 1 + i);
      utimesSync(join(deck, ".liebstoeckel", "dev", "snapshots", `b${i}.json`), t, t);
    }
    pruneBatchSnapshots(deck, 2);
    expect(loadBatchSnapshot(deck, "b4")).not.toBeNull();
    expect(loadBatchSnapshot(deck, "b3")).not.toBeNull();
    expect(loadBatchSnapshot(deck, "b2")).toBeNull();
    expect(loadBatchSnapshot(deck, "b0")).toBeNull();
    // No snapshots dir at all: a no-op, not a crash.
    pruneBatchSnapshots(mkdtempSync(join(tmpdir(), "lst-prune-empty-")), 2);
  });
});
