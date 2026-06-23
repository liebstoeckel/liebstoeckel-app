import { test, expect, describe } from "bun:test";
import { routeKey, preventsDefault } from "./interaction";

describe("routeKey · slide", () => {
  test("preserves the normal presenting controls", () => {
    expect(routeKey("slide", "ArrowRight")).toBe("next");
    expect(routeKey("slide", " ")).toBe("next");
    expect(routeKey("slide", "PageDown")).toBe("next");
    expect(routeKey("slide", "ArrowLeft")).toBe("prev");
    expect(routeKey("slide", "Home")).toBe("first");
    expect(routeKey("slide", "End")).toBe("last");
    expect(routeKey("slide", "o")).toBe("overview");
    expect(routeKey("slide", "f")).toBe("fullscreen");
    expect(routeKey("slide", "b")).toBe("blur");
    expect(routeKey("slide", "?")).toBe("help");
    expect(routeKey("slide", "5")).toEqual({ digit: "5" });
    expect(routeKey("slide", "Enter")).toEqual({ digit: "Enter" });
    expect(routeKey("slide", "z")).toBeNull();
  });
});

describe("routeKey · overview (captures nav keys)", () => {
  test("arrows move the grid selection, never the deck", () => {
    expect(routeKey("overview", "ArrowRight")).toEqual({ grid: "right" });
    expect(routeKey("overview", "ArrowLeft")).toEqual({ grid: "left" });
    expect(routeKey("overview", "ArrowUp")).toEqual({ grid: "up" });
    expect(routeKey("overview", "ArrowDown")).toEqual({ grid: "down" });
  });
  test("Enter opens the selection; Esc/o close; digits jump", () => {
    expect(routeKey("overview", "Enter")).toBe("select");
    expect(routeKey("overview", "Escape")).toBe("exitModal");
    expect(routeKey("overview", "o")).toBe("overview");
    expect(routeKey("overview", "3")).toEqual({ digit: "3" });
  });
  test("Space (deck advance) is swallowed in the overview", () => {
    expect(routeKey("overview", " ")).toBeNull();
    expect(routeKey("overview", "PageDown")).toBeNull();
  });
});

describe("routeKey · end (terminal card)", () => {
  test("back / overview / restart / jump", () => {
    expect(routeKey("end", "ArrowLeft")).toBe("exitModal");
    expect(routeKey("end", "Escape")).toBe("exitModal");
    expect(routeKey("end", "o")).toBe("overview");
    expect(routeKey("end", "r")).toBe("restart");
    expect(routeKey("end", "Home")).toBe("restart");
    expect(routeKey("end", "4")).toEqual({ digit: "4" });
    expect(routeKey("end", "Enter")).toEqual({ digit: "Enter" });
  });
  test("forward keys are swallowed (no replay/loop)", () => {
    expect(routeKey("end", "ArrowRight")).toBeNull();
    expect(routeKey("end", " ")).toBeNull();
    expect(routeKey("end", "PageDown")).toBeNull();
  });
});

describe("preventsDefault", () => {
  test("suppresses page scroll for arrows / space / page keys", () => {
    for (const k of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "PageUp", "PageDown"]) {
      expect(preventsDefault(k)).toBe(true);
    }
    expect(preventsDefault("a")).toBe(false);
    expect(preventsDefault("Enter")).toBe(false);
  });
});
