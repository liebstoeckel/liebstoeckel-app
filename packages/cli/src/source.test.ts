import { describe, expect, test } from "bun:test";
import type { CheckpointRecord } from "@liebstoeckel/dev-server/sync";
import { attributedMessage, checkpointsBetween, filesWithMarkers, planPull, withMarkers } from "./source";

const base = { "a.mdx": "1\n2\n3\n4\n5\n", "b.mdx": "b\n" };

describe("planPull", () => {
  test("in sync", () => {
    expect(planPull(base, base, base)).toEqual({ kind: "in-sync" });
  });

  test("only the live side moved: write locally, nothing to upload", () => {
    const live = { ...base, "a.mdx": "ONE\n2\n3\n4\n5\n" };
    expect(planPull(base, base, live)).toEqual({ kind: "merged", tree: live, writeLocal: true, upload: false });
  });

  test("both moved on different lines: merge, write and upload", () => {
    const local = { ...base, "a.mdx": "1\n2\n3\n4\nFIVE\n", "c.mdx": "c\n" };
    const live = { ...base, "a.mdx": "ONE\n2\n3\n4\n5\n" };
    const plan = planPull(base, local, live);
    expect(plan).toEqual({
      kind: "merged",
      tree: { "a.mdx": "ONE\n2\n3\n4\nFIVE\n", "b.mdx": "b\n", "c.mdx": "c\n" },
      writeLocal: true,
      upload: true,
    });
  });

  test("conflicts keep everything that merged and the local version of conflicting files", () => {
    const local = { "a.mdx": "1\nLOCAL\n3\n4\n5\n", "b.mdx": "b\n" };
    const live = { "a.mdx": "1\nLIVE\n3\n4\n5\n", "b.mdx": "B\n" };
    const plan = planPull(base, local, live);
    expect(plan.kind).toBe("conflict");
    if (plan.kind === "conflict") {
      expect(plan.conflicts.map((c) => c.path)).toEqual(["a.mdx"]);
      expect(plan.tree).toEqual({ "a.mdx": "1\nLOCAL\n3\n4\n5\n", "b.mdx": "B\n" });
    }
  });
});

describe("withMarkers", () => {
  test("writes Git conflict markers", async () => {
    const out = await withMarkers("x\ny\n", "x\nLOCAL\n", "x\nLIVE\n");
    expect(out).toContain("<<<<<<< local");
    expect(out).toContain(">>>>>>> live");
    expect(filesWithMarkers({ "a.mdx": out, "b.mdx": "fine\n" })).toEqual(["a.mdx"]);
  });
});

const cp = (commit: string, ...names: string[]): CheckpointRecord => ({
  commit,
  parent: null,
  time: 0,
  authors: names.map((n) => ({ name: n, email: `${n.toLowerCase()}@x.io` })),
  message: "m",
  kind: "auto",
});

describe("attribution", () => {
  const history = [cp("c1", "Anna"), cp("c2", "Ben", "Anna"), cp("c3", "Cleo"), cp("c4", "Dev")];

  test("checkpointsBetween is exclusive of the start, inclusive of the end", () => {
    expect(checkpointsBetween(history, "c1", "c3").map((c) => c.commit)).toEqual(["c2", "c3"]);
    expect(checkpointsBetween(history, null, null).map((c) => c.commit)).toEqual(["c1", "c2", "c3", "c4"]);
    expect(checkpointsBetween(history, "c4", null)).toEqual([]);
  });

  test("attributedMessage credits others once and skips the committer", () => {
    const msg = attributedMessage(checkpointsBetween(history, null, "c3"), "anna@x.io");
    expect(msg).toBe("Live edits from liebstoeckel\n\nCo-authored-by: Ben <ben@x.io>\nCo-authored-by: Cleo <cleo@x.io>\n");
  });

  test("no trailers when nobody else edited", () => {
    expect(attributedMessage([cp("c1", "Anna")], "anna@x.io")).toBe("Live edits from liebstoeckel\n");
  });
});

describe("local files are safe", () => {
  const { mkdtempSync, rmSync, writeFileSync, existsSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");

  test("writeTreeChanges refuses paths outside the deck; safeTree drops them", async () => {
    const { writeTreeChanges, safeTree } = await import("./source");
    const dir = mkdtempSync(join(tmpdir(), "src-safe-"));
    try {
      expect(() => writeTreeChanges(dir, {}, { "../evil.mdx": "x" })).toThrow("outside the deck");
      expect(existsSync(join(dir, "..", "evil.mdx"))).toBe(false);
      expect(safeTree({ "../evil.mdx": "x", "ok.mdx": "y" })).toEqual({ "ok.mdx": "y" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("writeTreeChanges refuses to write through a symlinked folder", async () => {
    const { writeTreeChanges } = await import("./source");
    const { symlinkSync, mkdirSync } = require("node:fs") as typeof import("node:fs");
    const dir = mkdtempSync(join(tmpdir(), "src-link-"));
    const outside = mkdtempSync(join(tmpdir(), "src-outside-"));
    try {
      symlinkSync(outside, join(dir, "slides"), "dir");
      mkdirSync(join(dir, "ok"));
      expect(() => writeTreeChanges(dir, {}, { "slides/a.mdx": "x" })).toThrow("symlink");
      expect(existsSync(join(outside, "a.mdx"))).toBe(false);
      expect(writeTreeChanges(dir, {}, { "ok/b.mdx": "y" })).toEqual(["ok/b.mdx"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test("an oversized source file is an error, not a deletion", async () => {
    const { readLocalTree } = await import("./source");
    const dir = mkdtempSync(join(tmpdir(), "src-big-"));
    try {
      writeFileSync(join(dir, "data.json"), "x".repeat(600 * 1024));
      expect(() => readLocalTree(dir)).toThrow("cannot be synced");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("attributedMessage strips header-breaking characters from names", () => {
    const msg = attributedMessage([cp("c1", "Eve\nCo-authored-by: Mallory")], null);
    // One trailer line: the injected newline is gone.
    expect(msg.split("\n").filter((l) => l.startsWith("Co-authored-by:"))).toHaveLength(1);
  });
});
