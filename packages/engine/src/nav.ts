import { useEffect } from "react";
import { resolveTouchGesture, NO_NAV_SELECTOR } from "./mobile";

/** Touch navigation: horizontal swipe + edge tap-zones, resolved by the pure
 *  `resolveTouchGesture`. Reuses `onNext`/`onPrev` so step-reveals still run before
 *  a slide change. Enable only where navigation is the user's job (standalone +
 *  presenter) — a live viewer follows the presenter. Gestures on interactive
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
 *  shortcuts — otherwise `f`/`o`/space/arrows/Enter drive the deck while you type.
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

// Keyboard navigation. `onNext`/`onPrev` let the deck intercept for step reveals;
// they fall back to slide nav. Slide index lives in the deck controller (synced).
export function useDeckNav(opts: {
  count: number;
  setIndex: (updater: (n: number) => number | number) => void;
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
}) {
  const {
    count,
    setIndex,
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
  } = opts;

  useEffect(() => {
    const next = onNext ?? (() => setIndex((n: number) => Math.min(n + 1, count - 1)));
    const prev = onPrev ?? (() => setIndex((n: number) => Math.max(n - 1, 0)));
    const onKey = (e: KeyboardEvent) => {
      // don't hijack typing in a plugin's input (Q&A box, etc.)
      if (isEditableTarget(e.target)) return;
      switch (e.key) {
        case "ArrowRight":
        case " ":
        case "PageDown":
          e.preventDefault();
          next();
          break;
        case "ArrowLeft":
        case "PageUp":
          e.preventDefault();
          prev();
          break;
        case "Home":
          setIndex(() => 0);
          break;
        case "End":
          setIndex(() => count - 1);
          break;
        case "t":
          onToggleBrand?.();
          break;
        case "p":
          onOpenPresenter?.();
          break;
        case "f":
          onFullscreen?.();
          break;
        case "b":
          onBlur?.();
          break;
        case "o":
          onOverview?.();
          break;
        case "q":
          onQr?.();
          break;
        case "?":
        case "h":
          onToggleHelp?.();
          break;
        default:
          if (onDigit && (/^[0-9]$/.test(e.key) || e.key === "Enter" || e.key === "Escape")) onDigit(e.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, setIndex, onNext, onPrev, onToggleBrand, onOpenPresenter, onToggleHelp, onFullscreen, onBlur, onOverview, onQr, onDigit]);
}
