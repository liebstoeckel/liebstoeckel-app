// Pure helpers for the overview grid's keyboard selection. No DOM — unit-testable.

export type GridDir = "left" | "right" | "up" | "down";

/** Columns the overview grid renders at a given viewport width — mirrors the
 *  Tailwind breakpoints on the grid (`grid-cols-2` base, `sm:grid-cols-3`,
 *  `lg:grid-cols-4`). Used to make ↑/↓ move by a row. */
export function gridCols(width: number): number {
  if (width >= 1024) return 4;
  if (width >= 640) return 3;
  return 2;
}

/** Move a 0-based selection within a `count`-item, `cols`-wide grid by an arrow
 *  direction, clamped to [0, count-1]. ←/→ step linearly (so you can traverse the
 *  whole deck, crossing row boundaries); ↑/↓ step by a full row and stop at the
 *  edges rather than wrapping. */
export function moveSelection(sel: number, count: number, cols: number, dir: GridDir): number {
  if (count <= 0) return 0;
  const c = Math.max(1, cols);
  const clamp = (n: number) => Math.min(Math.max(n, 0), count - 1);
  switch (dir) {
    case "left":
      return clamp(sel - 1);
    case "right":
      return clamp(sel + 1);
    case "up":
      return sel - c >= 0 ? sel - c : sel;
    case "down":
      return sel + c <= count - 1 ? sel + c : sel;
  }
}
