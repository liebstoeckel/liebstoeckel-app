// The contract between the engine's CaptureView / PrintView and the
// @liebstoeckel/thumbnails capturer (a headless browser). The capturer sets a flag
// *before* the deck boots (so Present renders a static view, not the live Deck).
//
// Two static modes share this file:
//  • Capture (thumbnails / PNG export): CAPTURE_FLAG → CaptureView. Reads
//    SLIDE_COUNT, then for each slide dispatches CAPTURE_EVENT(index) and waits
//    until CAPTURE_READY === index before screenshotting (one slide at a time).
//  • Print (vector PDF export): PRINT_FLAG → PrintView, which stacks every slide
//    onto its own print page so one `page.pdf()` yields a text-preserving,
//    multi-page PDF. Reads SLIDE_COUNT, dispatches PRINT_SELECT_EVENT({indices,
//    token}) to pick the slides, then waits until PRINT_READY === token.
//
// Pure (no React / DOM types beyond globalThis) so the capturer package can import
// the names without pulling the engine's React tree.

export const CAPTURE_FLAG = "__LIEBSTOECKEL_CAPTURE__";
export const SLIDE_COUNT = "__LIEBSTOECKEL_SLIDE_COUNT__";
export const CAPTURE_READY = "__LIEBSTOECKEL_CAPTURE_READY__";
export const CAPTURE_EVENT = "liebstoeckel:capture";

export const PRINT_FLAG = "__LIEBSTOECKEL_PRINT__";
export const PRINT_READY = "__LIEBSTOECKEL_PRINT_READY__";
export const PRINT_SELECT_EVENT = "liebstoeckel:print-select";

export interface CaptureFlag {
  /** slide to render first (the capturer then steps through the rest) */
  index?: number;
}

export interface PrintFlag {
  /** 0-based slides to lay out (default: every slide). The driver usually leaves
   *  this empty and selects via PRINT_SELECT_EVENT once SLIDE_COUNT is known. */
  indices?: number[];
}

/** The payload of a PRINT_SELECT_EVENT: which slides to render, plus a token the
 *  view echoes into PRINT_READY once that selection has painted (so the driver
 *  waits for the right frame, not a stale one). */
export interface PrintSelect {
  indices: number[];
  token: number;
}

/** Read the capture request the capturer injects. Absent → normal deck. */
export function captureRequest(): CaptureFlag | null {
  const g = globalThis as Record<string, unknown>;
  return (g[CAPTURE_FLAG] as CaptureFlag | undefined) ?? null;
}

/** Read the print request the exporter injects. Absent → not a print render. */
export function printRequest(): PrintFlag | null {
  const g = globalThis as Record<string, unknown>;
  return (g[PRINT_FLAG] as PrintFlag | undefined) ?? null;
}
