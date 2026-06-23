import { useEffect } from "react";
import { resolveTouchGesture, NO_NAV_SELECTOR } from "./mobile";
import { routeKey, preventsDefault, type NavMode } from "./interaction";
import type { GridDir } from "./overview";

/** Touch navigation: horizontal swipe + edge tap-zones, resolved by the pure
 *  `resolveTouchGesture`. Reuses `onNext`/`onPrev` so step-reveals still run before
 *  a slide change. Enable only where navigation is the user's job (standalone +
 *  presenter), a live viewer follows the presenter. Gestures on interactive
 *  elements (buttons, the plugin region) are ignored. */
export function useTouchNav(opts: { enabled: boolean; onNext: () => void; onPrev: () => void }) {
  const { enabled, onNext, onPrev } = opts;
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let sx = 0;
    let sy = 0;
    let onInteractive = false;
    const onStart = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (!t) return;
      sx = t.clientX;
      sy = t.clientY;
      const el = e.target as Element | null;
      onInteractive = !!el?.closest?.(NO_NAV_SELECTOR);
    };
    const onEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (!t) return;
      const move = resolveTouchGesture({
        dx: t.clientX - sx,
        dy: t.clientY - sy,
        x: sx,
        width: window.innerWidth,
        onInteractive,
      });
      if (move === "next") onNext();
      else if (move === "prev") onPrev();
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [enabled, onNext, onPrev]);
}

/** True when a key event originates from a text-editable element. Typing in a
 *  plugin's input (e.g. the Q&A question box) must NOT trigger the global deck
 *  shortcuts, otherwise `f`/`o`/space/arrows/Enter drive the deck while you type.
 *  Duck-typed (reads `tagName`/`isContentEditable`) so it's unit-testable without a
 *  DOM. */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as (Partial<HTMLElement> & { tagName?: string }) | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  switch (el.tagName) {
    case "INPUT":
    case "TEXTAREA":
    case "SELECT":
      return true;
    default:
      return false;
  }
}

// Keyboard navigation, routed by the active interaction layer (`mode`). In a modal
// layer (overview, end) the layer owns its keys and deck nav never leaks through —
// the routing is the pure `routeKey` (key × mode → action); this hook just dispatches.
// `onNext`/`onPrev` let the deck intercept for step reveals; they fall back to slide nav.
export function useDeckNav(opts: {
  count: number;
  setIndex: (updater: (n: number) => number | number) => void;
  /** Active interaction layer. Defaults to "slide". */
  mode?: NavMode;
  onNext?: () => void;
  onPrev?: () => void;
  onToggleBrand?: () => void;
  onOpenPresenter?: () => void;
  onToggleHelp?: () => void;
  onFullscreen?: () => void;
  onBlur?: () => void;
  onOverview?: () => void;
  onQr?: () => void;
  onDigit?: (key: string) => void;
  /** Overview grid selection move (← → ↑ ↓ while the overview is open). */
  onGridMove?: (dir: GridDir) => void;
  /** Confirm the overview selection (Enter). */
  onSelect?: () => void;
  /** Close the top modal / go back (Esc, or ← on the end screen). */
  onExitModal?: () => void;
  /** Restart to the first slide (R / Home on the end screen). */
  onRestart?: () => void;
}) {
  const {
    count,
    setIndex,
    mode = "slide",
    onNext,
    onPrev,
    onToggleBrand,
    onOpenPresenter,
    onToggleHelp,
    onFullscreen,
    onBlur,
    onOverview,
    onQr,
    onDigit,
    onGridMove,
    onSelect,
    onExitModal,
    onRestart,
  } = opts;

  useEffect(() => {
    const next = onNext ?? (() => setIndex((n: number) => Math.min(n + 1, count - 1)));
    const prev = onPrev ?? (() => setIndex((n: number) => Math.max(n - 1, 0)));
    const onKey = (e: KeyboardEvent) => {
      // don't hijack typing in a plugin's input (Q&A box, etc.)
      if (isEditableTarget(e.target)) return;
      const action = routeKey(mode, e.key);
      if (action == null) return;
      if (preventsDefault(e.key)) e.preventDefault();
      if (typeof action === "object") {
        if ("grid" in action) onGridMove?.(action.grid);
        else onDigit?.(action.digit);
        return;
      }
      switch (action) {
        case "next": next(); break;
        case "prev": prev(); break;
        case "first": setIndex(() => 0); break;
        case "last": setIndex(() => count - 1); break;
        case "select": onSelect?.(); break;
        case "exitModal": onExitModal?.(); break;
        case "restart": onRestart?.(); break;
        case "toggleBrand": onToggleBrand?.(); break;
        case "presenter": onOpenPresenter?.(); break;
        case "fullscreen": onFullscreen?.(); break;
        case "blur": onBlur?.(); break;
        case "overview": onOverview?.(); break;
        case "qr": onQr?.(); break;
        case "help": onToggleHelp?.(); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, setIndex, mode, onNext, onPrev, onToggleBrand, onOpenPresenter, onToggleHelp, onFullscreen, onBlur, onOverview, onQr, onDigit, onGridMove, onSelect, onExitModal, onRestart]);
}
