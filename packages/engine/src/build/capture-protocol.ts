// The contract between the engine's CaptureView and the @liebstoeckel/thumbnails
// capturer (a headless browser). The capturer sets CAPTURE_FLAG *before* the deck
// boots (so Present renders CaptureView, not the live Deck), reads SLIDE_COUNT to
// learn how many slides exist, then for each slide dispatches a CAPTURE_EVENT with
// the index and waits until CAPTURE_READY equals that index before screenshotting.
//
// Pure (no React / DOM types beyond globalThis) so the capturer package can import
// the names without pulling the engine's React tree.

export const CAPTURE_FLAG = "__LIEBSTOECKEL_CAPTURE__";
export const SLIDE_COUNT = "__LIEBSTOECKEL_SLIDE_COUNT__";
export const CAPTURE_READY = "__LIEBSTOECKEL_CAPTURE_READY__";
export const CAPTURE_EVENT = "liebstoeckel:capture";

export interface CaptureFlag {
  /** slide to render first (the capturer then steps through the rest) */
  index?: number;
}

/** Read the capture request the capturer injects. Absent → normal deck. */
export function captureRequest(): CaptureFlag | null {
  const g = globalThis as Record<string, unknown>;
  return (g[CAPTURE_FLAG] as CaptureFlag | undefined) ?? null;
}
