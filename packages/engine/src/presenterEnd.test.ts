import { test, expect, describe } from "bun:test";
import { routeKey } from "./interaction.ts";
import { stepForward, resolveStep, clampIndex, STEP_ALL } from "./delivery.ts";

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

  test("the presenter routes forward keys as ordinary nav, so it needs its own guard", () => {
    // The presenter passes no mode, so every key routes as "slide" and the end layer
    // above is unreachable from it. Its guard therefore cannot come from routeKey.
    expect(routeKey("slide", "ArrowRight")).toBe("next");
    expect(routeKey("slide", " ")).toBe("next");
    expect(routeKey("slide", "PageDown")).toBe("next");
  });

  test("unguarded, advancing at the end rewinds the last slide's reveals", () => {
    // The reported bug, in the two functions that produced it: stepForward reports a
    // slide change, and the index clamps back onto the slide we are already on, so
    // the commit is "same slide, step 0" -- a replay.
    const r = stepForward(TOTAL, TOTAL);
    expect(r).toEqual({ step: 0, advanceSlide: true });
    expect(clampIndex(LAST + 1, COUNT)).toBe(LAST);
  });

  test("a slide entered backwards is treated as finished, not as reveals remaining", () => {
    // Where the two fixes meet: on the last slide entered backwards, `step` is the
    // sentinel. Resolving it must report the slide as fully shown, so the end guard
    // fires instead of stepForward advancing into a replay.
    const shown = resolveStep(STEP_ALL, TOTAL);
    expect(shown).toBe(TOTAL);
    expect(stepForward(shown, TOTAL).advanceSlide).toBe(true);
  });
});
