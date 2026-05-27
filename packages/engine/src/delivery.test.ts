import { test, expect, describe } from "bun:test";
import { clampIndex, fullscreenAction, accumulateDigits, stepForward, stepBack } from "./delivery";

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
