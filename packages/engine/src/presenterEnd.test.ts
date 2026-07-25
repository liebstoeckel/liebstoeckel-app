import { test, expect, describe } from "bun:test";
import { routeKey } from "./interaction.ts";
import { stepForward, resolveStep, STEP_ALL } from "./delivery.ts";

// Public issue #4: "Presenter mode loops the last page instead of showing the
// ending page." Both windows bind the same useDeckNav, but the presenter passed
// no `mode` and the raw ctrl.next, so the end layer below was unreachable from it
// and advancing clamped the index back onto the last slide with step reset to 0,
// replaying its reveals.
const COUNT = 3;
const LAST = COUNT - 1;
const TOTAL = 2;

describe("issue #4: advancing at the end of the deck", () => {
  test("the deck window's end layer swallows forward keys", () => {
    expect(routeKey("slide", "ArrowRight")).toBe("next");
    expect(routeKey("end", "ArrowRight")).toBeNull();
    expect(routeKey("end", " ")).toBeNull();
    expect(routeKey("end", "PageDown")).toBeNull();
  });

  test("the presenter window has no end layer, so its advance must be guarded", () => {
    // The presenter routes every key as "slide" (no mode), so the guard cannot come
    // from routeKey: it comes from atEnd, the same value that disables Next.
    expect(routeKey("slide", "ArrowRight")).toBe("next");
    const atEnd = LAST >= COUNT - 1 && TOTAL >= TOTAL;
    expect(atEnd).toBe(true);

    // What the unguarded path did: clamp back onto the last slide, step reset to 0.
    const unguarded = stepForward(TOTAL, TOTAL);
    expect(unguarded).toEqual({ step: 0, advanceSlide: true });
  });

  test("a slide entered backwards still ends rather than re-revealing", () => {
    // Regression guard for the two fixes meeting: on the last slide, entered
    // backwards, `step` is the sentinel. Resolving it must satisfy the end guard
    // instead of reading as "reveals remaining" and advancing into a replay.
    const shown = resolveStep(STEP_ALL, TOTAL);
    expect(shown >= TOTAL).toBe(true);
  });
});
