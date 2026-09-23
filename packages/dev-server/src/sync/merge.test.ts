import { describe, expect, test } from "bun:test";
import { mergeText, mergeTrees } from "./merge.ts";

const base = "a\nb\nc\nd\ne\n";

describe("mergeText", () => {
  test("takes the only changed side", () => {
    expect(mergeText(base, base, "a\nB\nc\nd\ne\n")).toEqual({ ok: true, text: "a\nB\nc\nd\ne\n" });
    expect(mergeText(base, "a\nB\nc\nd\ne\n", base)).toEqual({ ok: true, text: "a\nB\nc\nd\ne\n" });
  });

  test("combines changes to separate regions", () => {
    const merged = mergeText(base, "A\nb\nc\nd\ne\n", "a\nb\nc\nd\nE\n");
    expect(merged).toEqual({ ok: true, text: "A\nb\nc\nd\nE\n" });
  });

  test("applies an identical change once", () => {
    expect(mergeText(base, "a\nX\nc\nd\ne\n", "a\nX\nc\nd\ne\n")).toEqual({ ok: true, text: "a\nX\nc\nd\ne\n" });
  });

  test("conflicts on different changes to the same line", () => {
    const merged = mergeText(base, "a\nX\nc\nd\ne\n", "a\nY\nc\nd\ne\n");
    expect(merged.ok).toBe(false);
    if (!merged.ok) expect(merged.conflicts).toEqual([{ baseStart: 1, baseEnd: 2 }]);
  });

  test("conflicts on adjacent changes, like Git", () => {
    expect(mergeText(base, "a\nX\nc\nd\ne\n", "a\nb\nY\nd\ne\n").ok).toBe(false);
  });

  test("combines an insertion with a distant edit", () => {
    const merged = mergeText(base, "a\nb\nc\nd\ne\nf\n", "a\nB\nc\nd\ne\n");
    expect(merged).toEqual({ ok: true, text: "a\nB\nc\nd\ne\nf\n" });
  });
});

describe("mergeTrees", () => {
  test("merges per file and keeps adds and deletes from one side", () => {
    const merged = mergeTrees(
      { "a.mdx": base, "old.mdx": "x\n" },
      { "a.mdx": "A\nb\nc\nd\ne\n", "old.mdx": "x\n", "new.mdx": "n\n" },
      { "a.mdx": "a\nb\nc\nd\nE\n" },
    );
    expect(merged).toEqual({ ok: true, tree: { "a.mdx": "A\nb\nc\nd\nE\n", "new.mdx": "n\n" } });
  });

  test("reports delete/modify and content conflicts", () => {
    const merged = mergeTrees(
      { "a.mdx": base, "b.mdx": "b\n" },
      { "a.mdx": "a\nX\nc\nd\ne\n" },
      { "a.mdx": "a\nY\nc\nd\ne\n", "b.mdx": "changed\n" },
    );
    expect(merged.ok).toBe(false);
    if (!merged.ok) expect(merged.conflicts.map((c) => [c.path, c.kind])).toEqual([["a.mdx", "content"], ["b.mdx", "delete"]]);
  });
});

describe("mergeText preferOurs", () => {
  test("keeps our side only where both changed", () => {
    const merged = mergeText("a\nb\nc\nd\ne\n", "a\nOURS\nc\nd\ne\n", "a\nTHEIRS\nc\nd\nE\n", { preferOurs: true });
    expect(merged).toEqual({ ok: true, text: "a\nOURS\nc\nd\nE\n" });
  });
});
