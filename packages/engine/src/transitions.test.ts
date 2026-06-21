import { test, expect, describe } from "bun:test";
import {
  resolveTransition,
  mobileTransitionsDisabled,
  TRANSITIONS,
  DEFAULT_TRANSITION,
  type SlideTransitionSpec,
} from "./transitions";

describe("resolveTransition", () => {
  test("resolves a preset name to its spec", () => {
    expect(resolveTransition("blur")).toBe(TRANSITIONS.blur);
    expect(resolveTransition("slide")).toBe(TRANSITIONS.slide);
  });

  test("undefined falls back to the default (fade)", () => {
    expect(resolveTransition(undefined)).toBe(TRANSITIONS[DEFAULT_TRANSITION]);
    expect(DEFAULT_TRANSITION).toBe("fade");
  });

  test("an unknown name falls back to the default", () => {
    // @ts-expect-error, exercising the runtime fallback for a bad value
    expect(resolveTransition("nope")).toBe(TRANSITIONS[DEFAULT_TRANSITION]);
  });

  test("a custom spec passes through unchanged", () => {
    const custom: SlideTransitionSpec = {
      variants: { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } },
      transition: { duration: 1 },
    };
    expect(resolveTransition(custom)).toBe(custom);
  });

  test("reduced motion wins over any request, no transform/blur, just opacity", () => {
    const r = resolveTransition("slide", true);
    expect(r.variants.center).toEqual({ opacity: 1 });
    // none of the variant states carry x / scale / filter under reduced motion
    for (const key of ["enter", "center", "exit"] as const) {
      expect(JSON.stringify(r.variants[key])).not.toContain("blur");
      expect(r.variants[key]).not.toHaveProperty("x");
      expect(r.variants[key]).not.toHaveProperty("scale");
    }
  });
});

describe("mobileTransitionsDisabled", () => {
  test("disabled on coarse pointer by default", () => {
    expect(mobileTransitionsDisabled(true)).toBe(true);
    expect(mobileTransitionsDisabled(true, false)).toBe(true);
  });
  test("opt back in with the escape hatch", () => {
    expect(mobileTransitionsDisabled(true, true)).toBe(false);
  });
  test("never disabled on a fine pointer (desktop)", () => {
    expect(mobileTransitionsDisabled(false)).toBe(false);
    expect(mobileTransitionsDisabled(false, true)).toBe(false);
  });
});

describe("directional presets mirror on nav direction", () => {
  test("slide enter/exit flip x by direction", () => {
    const enter = TRANSITIONS.slide.variants.enter as (d: 1 | -1) => { x: string };
    const exit = TRANSITIONS.slide.variants.exit as (d: 1 | -1) => { x: string };
    expect(enter(1).x).toBe("100%"); // forward: new enters from the right
    expect(enter(-1).x).toBe("-100%"); // back: new enters from the left
    expect(exit(1).x).toBe("-100%"); // forward: old leaves to the left
    expect(exit(-1).x).toBe("100%");
  });
});
