// Pure helpers for live-delivery controls (fullscreen, numeric jump, step nav).

export const clampIndex = (n: number, count: number) => Math.min(Math.max(n, 0), Math.max(count - 1, 0));

export function fullscreenAction(isFullscreen: boolean): "enter" | "exit" {
  return isFullscreen ? "exit" : "enter";
}

export async function toggleFullscreen(el: Element): Promise<void> {
  if (typeof document === "undefined") return;
  if (document.fullscreenElement) await document.exitFullscreen();
  else await (el as HTMLElement).requestFullscreen?.();
}

/** Accumulate digit keys into a buffer; Enter commits a 1-based slide number,
 *  Escape clears. Returns the next buffer and a committed (0-based) index | null. */
export function accumulateDigits(buffer: string, key: string): { buffer: string; commit: number | null } {
  if (/^[0-9]$/.test(key)) return { buffer: (buffer + key).slice(0, 3), commit: null };
  if (key === "Enter" && buffer) return { buffer: "", commit: parseInt(buffer, 10) - 1 };
  if (key === "Escape") return { buffer: "", commit: null };
  return { buffer, commit: null };
}

/** Advance within a slide's steps; once past the last step, signal a slide change. */
export function stepForward(step: number, total: number): { step: number; advanceSlide: boolean } {
  return step < total ? { step: step + 1, advanceSlide: false } : { step: 0, advanceSlide: true };
}

/** Retreat a step; at the first step, signal a slide change. */
export function stepBack(step: number): { step: number; retreatSlide: boolean } {
  return step > 0 ? { step: step - 1, retreatSlide: false } : { step: 0, retreatSlide: true };
}

/** "Show every reveal on whichever slide we land on." A slide's reveal count is
 *  produced by logic that runs at render time, so a backward move cannot name a
 *  concrete step when it is committed. It sends this instead, and each consumer
 *  resolves it against the total it actually knows (see resolveStep).
 *
 *  Deliberately a string in a union rather than a magic number: as `-1` it would
 *  flow silently through `total - step`, `i < step` and `step <= 0`, making
 *  correctness a matter of remembering to resolve at every site. As a union it
 *  is a compile error at each of them until the case is handled. */
export const STEP_ALL = "all" as const;

/** A reveal position: a concrete slot, or "every slot on the slide we land on". */
export type StepPos = number | typeof STEP_ALL;

/** How the deck enters a slide, which decides the reveal state it lands on:
 *  forward and jumps start unrevealed, backward lands fully revealed so reverse
 *  navigation replays the reveals in opposite order (as PowerPoint et al. do)
 *  instead of dumping you on a blank slide. One policy, shared by every
 *  controller, so standalone and live decks cannot drift apart. */
export type SlideEntry = "forward" | "backward" | "jump";
export function stepOnEnter(entry: SlideEntry): StepPos {
  return entry === "backward" ? STEP_ALL : 0;
}

/** Resolve a reveal position against a slide's real reveal count. A concrete
 *  step passes through untouched. */
export function resolveStep(step: StepPos, total: number): number {
  return step === STEP_ALL ? total : step;
}

/** Whether `total` describes the slide currently at `index`. `total` is reported
 *  by the mounted slide, so right after a slide change it still describes the
 *  one we left; resolving STEP_ALL against it would land on the wrong reveal. */
export function totalIsFresh(totalFor: number, index: number): boolean {
  return totalFor === index;
}
