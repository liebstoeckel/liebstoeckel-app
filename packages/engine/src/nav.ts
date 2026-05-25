import { useEffect } from "react";

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
