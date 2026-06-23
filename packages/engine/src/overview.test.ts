import { test, expect, describe } from "bun:test";
import { moveSelection, gridCols } from "./overview";

describe("gridCols", () => {
  test("matches the Tailwind breakpoints on the grid", () => {
    expect(gridCols(400)).toBe(2); // base
    expect(gridCols(700)).toBe(3); // sm
    expect(gridCols(1400)).toBe(4); // lg
    expect(gridCols(640)).toBe(3); // boundary
    expect(gridCols(1024)).toBe(4); // boundary
  });
});

describe("moveSelection", () => {
  // 7 items, 4 cols:  row0 = 0..3,  row1 = 4..6
  const count = 7;
  const cols = 4;

  test("left/right step linearly across rows, clamped", () => {
    expect(moveSelection(3, count, cols, "right")).toBe(4); // crosses to next row
    expect(moveSelection(4, count, cols, "left")).toBe(3); // crosses back
    expect(moveSelection(0, count, cols, "left")).toBe(0); // clamp at start
    expect(moveSelection(6, count, cols, "right")).toBe(6); // clamp at end
  });

  test("up/down move by a row and stop at the edges", () => {
    expect(moveSelection(5, count, cols, "up")).toBe(1); // 5 - 4
    expect(moveSelection(1, count, cols, "down")).toBe(5); // 1 + 4
    expect(moveSelection(1, count, cols, "up")).toBe(1); // already top row → stays
    expect(moveSelection(6, count, cols, "down")).toBe(6); // 6+4 out of range → stays
    expect(moveSelection(2, count, cols, "down")).toBe(6); // 2+4=6 in range
  });

  test("degenerate inputs", () => {
    expect(moveSelection(0, 0, cols, "right")).toBe(0); // empty deck
    expect(moveSelection(0, 1, 1, "down")).toBe(0); // single item
    // cols<1 is treated as 1 (a single column), so it behaves like cols=1
    expect(moveSelection(2, count, 0, "down")).toBe(moveSelection(2, count, 1, "down"));
  });
});
