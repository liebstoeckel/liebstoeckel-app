// Pure helpers for the mobile/touch behaviours (Featureset 5). Kept free of React
// and the DOM so the decision logic is unit-testable; the hooks/components consume
// these.

/** Below this stage scale, controls inside the scaled canvas are too small to tap
 *  comfortably, plugins offer a full-size breakout instead. */
export const BREAKOUT_SCALE_MAX = 0.6;

/** Should a plugin offer tap-to-expand rather than inline interaction?
 *  Only on a coarse pointer (touch) with a shrunk stage, when allowed (not a
 *  presenter preview) and the plugin actually takes input. */
export function breakoutEligible(opts: {
  allowed: boolean;
  coarse: boolean;
  scale: number;
  interactive: boolean;
}): boolean {
  const { allowed, coarse, scale, interactive } = opts;
  return allowed && coarse && interactive && scale > 0 && scale < BREAKOUT_SCALE_MAX;
}

export type TouchNav = "next" | "prev" | null;

export interface TouchGesture {
  dx: number; // end.x - start.x
  dy: number; // end.y - start.y
  /** tap x position (px) and the viewport width, for edge tap-zones */
  x: number;
  width: number;
  /** did the gesture start on an interactive element? (then never navigate) */
  onInteractive: boolean;
}

/** Resolve a finished touch into a slide move. A horizontal swipe wins; otherwise a
 *  near-stationary tap in the outer edge zones advances/retreats. Returns null for
 *  anything ambiguous or on interactive content. */
export function resolveTouchGesture(g: TouchGesture, opts: { swipeMin?: number; tapMax?: number; edge?: number } = {}): TouchNav {
  const swipeMin = opts.swipeMin ?? 50;
  const tapMax = opts.tapMax ?? 10;
  const edge = opts.edge ?? 0.25;
  if (g.onInteractive) return null;

  // horizontal swipe
  if (Math.abs(g.dx) > swipeMin && Math.abs(g.dx) > Math.abs(g.dy)) {
    return g.dx < 0 ? "next" : "prev";
  }
  // edge tap (only when essentially stationary)
  if (Math.abs(g.dx) <= tapMax && Math.abs(g.dy) <= tapMax && g.width > 0) {
    const frac = g.x / g.width;
    if (frac <= edge) return "prev";
    if (frac >= 1 - edge) return "next";
  }
  return null;
}

/** Selector for elements that own their own taps, touch nav ignores gestures here. */
export const NO_NAV_SELECTOR = "button, a, input, textarea, select, [role=button], [data-pi-no-nav]";

export const isPortrait = (w: number, h: number): boolean => h > w;

/** Widest screen (CSS px) that gets the phone-first audience view. Phones in portrait
 *  are 320 to 430 wide; a small tablet in portrait (600 and up) still fits a usable
 *  letterboxed slide with the glow and sheet. */
export const PHONE_FIRST_MAX_WIDTH = 560;

/** Should a live audience member see the phone-first view, where an interactive
 *  plugin on the current slide fills the screen below a small slide preview instead
 *  of hiding behind a "tap to interact" glow? Only a viewer (a presenter on a phone
 *  drives the deck and keeps the slide), on a touch screen held upright, narrow
 *  enough that the letterboxed slide is too small to read. Desktop windows, landscape
 *  phones and tablets keep the slide as it is. */
export function phoneFirst(opts: { role: string | undefined; coarse: boolean; width: number; height: number }): boolean {
  const { role, coarse, width, height } = opts;
  return role === "viewer" && coarse && width > 0 && isPortrait(width, height) && width <= PHONE_FIRST_MAX_WIDTH;
}

/** Where a live `<Plugin>` renders. `inline`: in the slide, as authored (desktop, or
 *  a stage big enough to tap). `glow`: in the slide behind a "tap to interact" glow
 *  that opens a sheet (touch on a shrunk stage). `phone`: below the slide preview in
 *  the phone-first view, leaving a marker in the slide. A slide on its way out stays
 *  where it was rather than taking the panel from the slide coming in. */
export type PluginPlacement = "inline" | "glow" | "phone";

export function pluginPlacement(opts: { eligible: boolean; phoneView: boolean; leaving: boolean }): PluginPlacement {
  if (!opts.eligible) return "inline";
  return opts.phoneView && !opts.leaving ? "phone" : "glow";
}
