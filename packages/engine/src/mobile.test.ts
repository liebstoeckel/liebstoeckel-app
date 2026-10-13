import { test, expect, describe } from "bun:test";
import { breakoutEligible, resolveTouchGesture, isPortrait, phoneFirst, pluginPlacement, BREAKOUT_SCALE_MAX, PHONE_FIRST_MAX_WIDTH } from "./mobile";

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

describe("phoneFirst", () => {
  const phone = { role: "viewer", coarse: true, width: 390, height: 844 };
  test("a viewer on a portrait touch phone gets the phone-first view", () => {
    expect(phoneFirst(phone)).toBe(true);
    expect(phoneFirst({ ...phone, width: 320, height: 568 })).toBe(true);
    expect(phoneFirst({ ...phone, width: PHONE_FIRST_MAX_WIDTH, height: 900 })).toBe(true);
  });
  test("desktop (fine pointer) keeps the slide, even in a narrow window", () => {
    expect(phoneFirst({ ...phone, coarse: false })).toBe(false);
    expect(phoneFirst({ ...phone, coarse: false, width: 1280, height: 760 })).toBe(false);
  });
  test("a landscape phone keeps the slide", () => {
    expect(phoneFirst({ ...phone, width: 844, height: 390 })).toBe(false);
  });
  test("a tablet in portrait keeps the slide", () => {
    expect(phoneFirst({ ...phone, width: 768, height: 1024 })).toBe(false);
    expect(phoneFirst({ ...phone, width: PHONE_FIRST_MAX_WIDTH + 1, height: 1024 })).toBe(false);
  });
  test("only the audience: a presenter or a standalone deck on a phone keeps the slide", () => {
    expect(phoneFirst({ ...phone, role: "presenter" })).toBe(false);
    expect(phoneFirst({ ...phone, role: undefined })).toBe(false);
  });
  test("not before the screen has a size", () => {
    expect(phoneFirst({ ...phone, width: 0, height: 0 })).toBe(false);
  });
});

describe("pluginPlacement", () => {
  test("desktop or a big stage: inline", () => {
    expect(pluginPlacement({ eligible: false, phoneView: false, leaving: false })).toBe("inline");
    expect(pluginPlacement({ eligible: false, phoneView: true, leaving: false })).toBe("inline");
  });
  test("touch on a shrunk stage: the glow, unless the phone-first view is on", () => {
    expect(pluginPlacement({ eligible: true, phoneView: false, leaving: false })).toBe("glow");
    expect(pluginPlacement({ eligible: true, phoneView: true, leaving: false })).toBe("phone");
  });
  test("a slide on its way out does not take the panel", () => {
    expect(pluginPlacement({ eligible: true, phoneView: true, leaving: true })).toBe("glow");
  });
});
