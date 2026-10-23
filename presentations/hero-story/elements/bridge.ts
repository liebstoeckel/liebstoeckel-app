// When this deck is shown in a frame on its own site (a landing page can put it
// in its hero), the page drives it: it asks for a slide as the visitor scrolls,
// and says when the deck is out of view so the 3D scene can stop drawing. The
// deck tells the page which slide it is on, so the page knows when it is ready.
//
// Every message is checked: a command counts only when it comes from the direct
// parent window on this same origin and has the right shape, and the deck's own
// reports go to this origin only. Standalone, or opened from a file, none of
// this runs. Slides move through the engine's own cross-window channel, the
// same message its other tools use to ask for a slide.

/** Messages from the page carry this source. */
export const FROM_PAGE = "liebstoeckel-landing";
/** Messages to the page carry this source. */
export const FROM_DECK = "liebstoeckel-hero";

export type PageCommand = { slide: number } | { visible: boolean };

type MessageLike = { source: unknown; origin: string; data: unknown };
type WindowLike = { parent: unknown; location: { protocol: string } };

/** True when the deck runs in a frame served over http(s). */
export function isFramed(win: WindowLike): boolean {
  return win.parent !== win && /^https?:$/.test(win.location.protocol);
}

/** The page's command in a message event, or null when it is not one we obey. */
export function readCommand(e: MessageLike, parent: unknown, origin: string, count: number): PageCommand | null {
  if (e.source !== parent || e.origin !== origin) return null;
  const d = e.data;
  if (!d || typeof d !== "object") return null;
  const m = d as Record<string, unknown>;
  if (m.source !== FROM_PAGE) return null;
  if (typeof m.slide === "number" && Number.isInteger(m.slide) && m.slide >= 0 && m.slide < count) return { slide: m.slide };
  if (typeof m.visible === "boolean") return { visible: m.visible };
  return null;
}

/** How far the page scrolls for an arrow key pressed inside the deck (0: leave the key alone). */
export function scrollStep(e: { key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; defaultPrevented: boolean }, typing: boolean, dialogOpen: boolean): number {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return 0;
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || typing || dialogOpen) return 0;
  return e.key === "ArrowDown" ? 48 : -48;
}

let started = false;
let current = -1;
let ready = false;
let visible = true;
const watchers = new Set<(visible: boolean) => void>();

function tell() {
  if (!started || !ready || current < 0) return;
  try {
    window.parent.postMessage({ source: FROM_DECK, slide: current }, location.origin);
  } catch {
    // a parent on another origin: the browser drops the message, nothing to do
  }
}

/** Starts listening to the page. Does nothing unless the deck is framed. */
export function startBridge(count: number) {
  if (started || typeof window === "undefined" || !isFramed(window)) return;
  started = true;
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel("liebstoeckel");
  } catch {
    channel = null;
  }
  window.addEventListener("message", (e) => {
    const c = readCommand(e, window.parent, location.origin, count);
    if (!c) return;
    if ("slide" in c) channel?.postMessage({ type: "goto", index: c.slide });
    else if (c.visible !== visible) {
      visible = c.visible;
      watchers.forEach((w) => w(visible));
    }
  });
  // The deck uses no up and down arrows on a slide, and some browsers do not pass
  // them on to the page from a frame, so after a click into the deck the page
  // would stop answering them. They scroll the page instead, when it is ours.
  window.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement | null;
    const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName ?? ""));
    const step = scrollStep(e, typing, !!document.querySelector('[aria-modal="true"]'));
    if (!step) return;
    try {
      if (window.parent.location.origin !== location.origin) return;
      e.preventDefault();
      window.parent.scrollBy({ top: step });
    } catch {
      // a page on another origin: leave the key to the browser
    }
  });
}

/** The slide the deck shows now; told to the page once the deck is ready. */
export function reportSlide(n: number) {
  if (n === current) return;
  current = n;
  tell();
}

/** The scene has drawn its first frame: the page may show the deck. */
export function markReady() {
  if (ready) return;
  ready = true;
  tell();
}

/** Whether the page currently shows the deck. */
export function isVisible(): boolean {
  return visible;
}

/** Calls `fn` whenever the page shows or hides the deck; returns the unsubscribe. */
export function onVisibility(fn: (visible: boolean) => void): () => void {
  watchers.add(fn);
  return () => watchers.delete(fn);
}

/** True when this deck runs framed (the first slide's hint then speaks of scrolling). */
export function framed(): boolean {
  return typeof window !== "undefined" && isFramed(window);
}
