import { test, expect, describe } from "bun:test";
import { trapTarget } from "./focus";

describe("trapTarget", () => {
  test("Tab walks forward and wraps from the last element to the first", () => {
    expect(trapTarget(0, 3, false)).toBe(1);
    expect(trapTarget(1, 3, false)).toBe(2);
    expect(trapTarget(2, 3, false)).toBe(0);
  });

  test("Shift+Tab walks backward and wraps from the first element to the last", () => {
    expect(trapTarget(2, 3, true)).toBe(1);
    expect(trapTarget(0, 3, true)).toBe(2);
  });

  test("focus on the dialog itself enters at the first (Tab) or last (Shift+Tab) element", () => {
    expect(trapTarget(-1, 3, false)).toBe(0);
    expect(trapTarget(-1, 3, true)).toBe(2);
  });

  test("a dialog with nothing focusable yields no target", () => {
    expect(trapTarget(-1, 0, false)).toBe(-1);
    expect(trapTarget(0, 0, true)).toBe(-1);
  });
});
