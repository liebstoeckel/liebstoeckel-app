import { test, expect, describe } from "bun:test";
import { breakoutEligible, resolveTouchGesture, isPortrait, BREAKOUT_SCALE_MAX } from "./mobile";

describe("breakoutEligible", () => {
  const base = { allowed: true, coarse: true, scale: 0.3, interactive: true };
  test("true on a coarse pointer + shrunk stage + interactive + allowed", () => {
    expect(breakoutEligible(base)).toBe(true);
  });
  test("false on a fine pointer (desktop)", () => {
    expect(breakoutEligible({ ...base, coarse: false })).toBe(false);
  });
  test("false when the stage isn't shrunk", () => {
    expect(breakoutEligible({ ...base, scale: 1 })).toBe(false);
    expect(breakoutEligible({ ...base, scale: BREAKOUT_SCALE_MAX })).toBe(false); // strictly below
  });
  test("false for display-only plugins or when suppressed", () => {
    expect(breakoutEligible({ ...base, interactive: false })).toBe(false);
    expect(breakoutEligible({ ...base, allowed: false })).toBe(false);
  });
  test("false before the stage has measured (scale 0)", () => {
    expect(breakoutEligible({ ...base, scale: 0 })).toBe(false);
  });
});

describe("resolveTouchGesture", () => {
  const g = (o: Partial<Parameters<typeof resolveTouchGesture>[0]>) =>
    resolveTouchGesture({ dx: 0, dy: 0, x: 200, width: 400, onInteractive: false, ...o });

  test("horizontal swipe left → next, right → prev", () => {
    expect(g({ dx: -80 })).toBe("next");
    expect(g({ dx: 80 })).toBe("prev");
  });
  test("a mostly-vertical swipe is ignored (scroll)", () => {
    expect(g({ dx: 60, dy: 200 })).toBeNull();
  });
  test("edge taps advance/retreat; center tap does nothing", () => {
    expect(g({ x: 10 })).toBe("prev"); // left edge
    expect(g({ x: 390 })).toBe("next"); // right edge
    expect(g({ x: 200 })).toBeNull(); // center
  });
  test("gestures on interactive content never navigate", () => {
    expect(g({ dx: -80, onInteractive: true })).toBeNull();
    expect(g({ x: 10, onInteractive: true })).toBeNull();
  });
});

describe("isPortrait", () => {
  test("height > width", () => {
    expect(isPortrait(390, 844)).toBe(true);
    expect(isPortrait(844, 390)).toBe(false);
  });
});
