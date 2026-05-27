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
