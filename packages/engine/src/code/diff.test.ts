import { test, expect, describe } from "bun:test";
import { matchLines, keySteps } from "./diff";
import type { TokenizedStep } from "./types";

// Build a step from plain lines (one token per line), enough to exercise keying.
const step = (...lines: string[]): TokenizedStep => ({
  lang: "ts",
  lines: lines.map((l) => [{ content: l }]),
});

describe("matchLines (LCS)", () => {
  test("identical → all matched in order", () => {
    expect(matchLines(["a", "b", "c"], ["a", "b", "c"])).toEqual([0, 1, 2]);
  });
  test("insertion in the middle → new line is null, others keep alignment", () => {
    expect(matchLines(["a", "c"], ["a", "b", "c"])).toEqual([0, null, 1]);
  });
  test("deletion → removed line absent from the mapping", () => {
    expect(matchLines(["a", "b", "c"], ["a", "c"])).toEqual([0, 2]);
  });
});

describe("keySteps (stable line identity across states)", () => {
  test("a line present in both states keeps its key (so it can FLIP)", () => {
    const [s0, s1] = keySteps([step("const a = 1"), step("const a = 1", "const b = 2")]);
    expect(s0!.lines[0]!.key).toBe(s1!.lines[0]!.key); // unchanged line → same key
    expect(s1!.lines[1]!.key).not.toBe(s0!.lines[0]!.key); // inserted line → fresh key
  });

  test("inserting above keeps the original line's identity", () => {
    const [s0, s1] = keySteps([step("return x"), step("const x = 1", "return x")]);
    expect(s1!.lines[1]!.key).toBe(s0!.lines[0]!.key); // 'return x' moved down, same key
  });

  test("keys are unique within a step and every line is keyed", () => {
    const [s] = keySteps([step("a", "b", "a")]); // duplicate text still distinct rows
    const keys = s!.lines.map((l) => l.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("chains identity across three states", () => {
    const steps = keySteps([step("a"), step("a", "b"), step("a", "b", "c")]);
    expect(steps[0]!.lines[0]!.key).toBe(steps[2]!.lines[0]!.key); // 'a' stable across all
    expect(steps[1]!.lines[1]!.key).toBe(steps[2]!.lines[1]!.key); // 'b' stable once added
  });
});
