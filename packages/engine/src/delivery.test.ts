import { test, expect, describe } from "bun:test";
import {
  clampIndex,
  fullscreenAction,
  accumulateDigits,
  stepForward,
  stepBack,
  stepOnEnter,
  resolveStep,
  totalIsFresh,
  STEP_ALL,
} from "./delivery";

// The slide-entry step policy: what `step` becomes when `index` changes. Public
// issues #4 and #5 were all one defect, every call site answering this its own way.
describe("slide-entry step policy", () => {
  test("forward and jumps land unrevealed, backward lands fully revealed", () => {
    expect(stepOnEnter("forward")).toBe(0);
    // A jump used to inherit the origin slide's step and partially reveal the target.
    expect(stepOnEnter("jump")).toBe(0);
    // Reverse navigation replays the reveals instead of dumping you on a blank slide.
    expect(stepOnEnter("backward")).toBe(STEP_ALL);
  });

  test("resolveStep expands the sentinel and passes concrete steps through", () => {
    expect(resolveStep(STEP_ALL, 3)).toBe(3);
    expect(resolveStep(STEP_ALL, 0)).toBe(0);
    expect(resolveStep(2, 3)).toBe(2);
  });

  test("resolved sentinel steps back through the reveals in reverse order", () => {
    // Entering slide N backwards shows all 3 reveals; ArrowLeft then hides the last.
    const shown = resolveStep(STEP_ALL, 3);
    expect(stepBack(shown)).toEqual({ step: 2, retreatSlide: false });
    // ...and only retreats another slide once they are all hidden again.
    expect(stepBack(0)).toEqual({ step: 0, retreatSlide: true });
  });

  test("advancing from a fully revealed slide moves on rather than re-revealing", () => {
    expect(stepForward(resolveStep(STEP_ALL, 3), 3)).toEqual({ step: 0, advanceSlide: true });
  });

  test("a total only counts for the slide it was measured on", () => {
    // Guards the double-backward-keypress edge: until the landed slide reports,
    // `total` still describes the slide we left.
    expect(totalIsFresh(2, 2)).toBe(true);
    expect(totalIsFresh(3, 2)).toBe(false);
  });
});

describe("clampIndex / fullscreenAction", () => {
  test("clamp", () => {
    expect(clampIndex(-2, 5)).toBe(0);
    expect(clampIndex(9, 5)).toBe(4);
    expect(clampIndex(2, 5)).toBe(2);
  });
  test("fullscreen action toggles", () => {
    expect(fullscreenAction(false)).toBe("enter");
    expect(fullscreenAction(true)).toBe("exit");
  });
});

describe("accumulateDigits (jump to slide)", () => {
  test("builds buffer, commits 1-based → 0-based on Enter", () => {
    let { buffer, commit } = accumulateDigits("", "1");
    expect(buffer).toBe("1");
    expect(commit).toBeNull();
    ({ buffer, commit } = accumulateDigits(buffer, "2"));
    expect(buffer).toBe("12");
    ({ buffer, commit } = accumulateDigits(buffer, "Enter"));
    expect(commit).toBe(11); // slide 12 → index 11
    expect(buffer).toBe("");
  });
  test("Escape clears; non-digit ignored", () => {
    expect(accumulateDigits("3", "Escape")).toEqual({ buffer: "", commit: null });
    expect(accumulateDigits("3", "x")).toEqual({ buffer: "3", commit: null });
    expect(accumulateDigits("", "Enter")).toEqual({ buffer: "", commit: null });
  });
});

describe("step navigation", () => {
  test("forward reveals steps then advances slide", () => {
    expect(stepForward(0, 2)).toEqual({ step: 1, advanceSlide: false });
    expect(stepForward(1, 2)).toEqual({ step: 2, advanceSlide: false });
    expect(stepForward(2, 2)).toEqual({ step: 0, advanceSlide: true });
    expect(stepForward(0, 0)).toEqual({ step: 0, advanceSlide: true }); // no steps → straight to next slide
  });
  test("back hides steps then retreats slide", () => {
    expect(stepBack(2)).toEqual({ step: 1, retreatSlide: false });
    expect(stepBack(1)).toEqual({ step: 0, retreatSlide: false });
    expect(stepBack(0)).toEqual({ step: 0, retreatSlide: true });
  });
});
