/** The join overlay's bottom line when it opened by itself at the start of a talk: the
 *  first forward press (a key, a clicker, a tap) only puts it away. */
export const START_HINT = "press → or tap anywhere to start";

/** Whether the deck opens the join overlay by itself when a live talk loads: only the
 *  presenter's own deck (the screen the room sees), with a join link to show, on the
 *  talk's first slide (a reload in the middle of a talk does not), when that slide has
 *  no join card of its own, and not on a phone driving the talk. Pure. */
export function shouldOpenJoinAtStart(at: {
  role: string | undefined;
  joinUrl: string | undefined;
  index: number;
  joinCardsOnScreen: number;
  coarsePointer: boolean;
}): boolean {
  return at.role === "presenter" && !!at.joinUrl && at.index === 0 && at.joinCardsOnScreen === 0 && !at.coarsePointer;
}
