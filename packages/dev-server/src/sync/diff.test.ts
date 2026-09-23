import { describe, expect, test } from "bun:test";
import { applyEdits, matchSequences, splitLines, textEdits } from "./diff.ts";

describe("splitLines", () => {
  test("keeps terminators and a last line without one", () => {
    expect(splitLines("a\nb\nc")).toEqual(["a\n", "b\n", "c"]);
    expect(splitLines("a\n")).toEqual(["a\n"]);
    expect(splitLines("")).toEqual([]);
  });
});

describe("matchSequences", () => {
  test("finds a longest common subsequence", () => {
    const a = [..."ABCABBA"];
    const b = [..."CBABAC"];
    const matched = matchSequences(a, b).reduce((n, m) => n + m.length, 0);
    expect(matched).toBe(4);
    for (const m of matchSequences(a, b)) {
      expect(a.slice(m.aStart, m.aStart + m.length)).toEqual(b.slice(m.bStart, m.bStart + m.length));
    }
  });

  test("handles empty inputs", () => {
    expect(matchSequences([], [1, 2])).toEqual([]);
    expect(matchSequences([1, 2], [])).toEqual([]);
  });
});

describe("textEdits", () => {
  test("round-trips", () => {
    const cases: Array<[string, string]> = [
      ["", "hello\n"],
      ["hello\n", ""],
      ["a\nb\nc\n", "a\nB\nc\n"],
      ["a\nb\nc\n", "x\na\nb\nc\ny\n"],
      ["one\ntwo\nthree\nfour\n", "one\nthree\nfour\nfive\n"],
      ["same", "same"],
      ["no newline", "no newline at all"],
    ];
    for (const [a, b] of cases) expect(applyEdits(a, textEdits(a, b))).toBe(b);
  });

  test("narrows a changed line to the differing characters", () => {
    expect(textEdits("title: Hello\n", "title: Hallo\n")).toEqual([{ index: 8, remove: 1, insert: "a" }]);
  });

  test("keeps separate hunks separate", () => {
    const edits = textEdits("a\nb\nc\nd\ne\n", "A\nb\nc\nd\nE\n");
    expect(edits).toHaveLength(2);
  });

  test("round-trips random edits", () => {
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const words = ["alpha\n", "beta\n", "gamma\n", "delta\n", "x", "\n"];
    const gen = () => Array.from({ length: rand(20) }, () => words[rand(words.length)]).join("");
    for (let i = 0; i < 300; i++) {
      const a = gen();
      const b = gen();
      expect(applyEdits(a, textEdits(a, b))).toBe(b);
    }
  });
});
