import { schema, t, type Infer } from "@liebstoeckel/plugin-sdk";

// One entry per phone: how often it pulled for each side. Keyed by participant,
// so the state grows with the room, not with the number of taps.
export const tugSchema = schema({
  pulls: t.record(t.object({ left: t.number, right: t.number })),
});
export type TugState = Infer<typeof tugSchema>;
export type Side = "left" | "right";

export interface Totals {
  left: number;
  right: number;
  players: number;
}

/** Sum every phone's pulls, in one pass. */
export function totals(s: TugState): Totals {
  let left = 0;
  let right = 0;
  let players = 0;
  for (const p of Object.values(s.pulls)) {
    left += p.left;
    right += p.right;
    if (p.left + p.right > 0) players++;
  }
  return { left, right, players };
}

/** Where the knot sits: -1 is all the way left, 1 all the way right. */
export function position(s: TugState): number {
  const { left, right } = totals(s);
  const all = left + right;
  // a few early pulls should not slam the rope to one end
  return all === 0 ? 0 : (right - left) / Math.max(all, 24);
}

/** The phone's own entry after more pulls for each side. */
export function pulled(s: TugState, pid: string, left: number, right: number): { left: number; right: number } {
  const mine = s.pulls[pid] ?? { left: 0, right: 0 };
  return { left: mine.left + left, right: mine.right + right };
}
