// Pure keyboard routing for the deck. Given the active interaction *layer* and a
// key, decide the action — so a modal layer (overview, end) captures its keys and
// deck navigation never leaks through it. No DOM; unit-testable (key × layer → action).
import type { GridDir } from "./overview";

export type NavMode = "slide" | "overview" | "end";

export type NavAction =
  | "next"
  | "prev"
  | "first"
  | "last"
  | "select"
  | "exitModal"
  | "restart"
  | "toggleBrand"
  | "presenter"
  | "fullscreen"
  | "blur"
  | "overview"
  | "qr"
  | "help"
  | { grid: GridDir }
  | { digit: string }
  | null;

const ARROW_GRID: Record<string, GridDir> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

const isDigit = (key: string) => /^[0-9]$/.test(key);

/** Keys whose browser default (page scroll) we suppress when they map to an action. */
export function preventsDefault(key: string): boolean {
  return key in ARROW_GRID || key === " " || key === "PageDown" || key === "PageUp";
}

export function routeKey(mode: NavMode, key: string): NavAction {
  // Overview: a modal grid picker. Arrows move the selection, Enter opens it,
  // digits build a jump, Esc/o close. Everything else is swallowed (no deck nav).
  if (mode === "overview") {
    if (key in ARROW_GRID) return { grid: ARROW_GRID[key] };
    if (key === "Enter") return "select";
    if (key === "Escape") return "exitModal";
    if (key === "o") return "overview";
    if (isDigit(key)) return { digit: key };
    if (key === "f") return "fullscreen";
    if (key === "q") return "qr";
    if (key === "?" || key === "h") return "help";
    return null;
  }
  // End screen: a terminal card. ←/Esc/Backspace go back, o opens the overview,
  // r/Home restart, digits/Enter jump. Forward keys are swallowed (no replay).
  if (mode === "end") {
    if (key === "ArrowLeft" || key === "Escape" || key === "Backspace") return "exitModal";
    if (key === "o") return "overview";
    if (key === "r" || key === "Home") return "restart";
    if (isDigit(key) || key === "Enter") return { digit: key };
    if (key === "f") return "fullscreen";
    if (key === "q") return "qr";
    if (key === "?" || key === "h") return "help";
    return null;
  }
  // Slide (default) — the normal presenting controls.
  switch (key) {
    case "ArrowRight":
    case " ":
    case "PageDown":
      return "next";
    case "ArrowLeft":
    case "PageUp":
      return "prev";
    case "Home":
      return "first";
    case "End":
      return "last";
    case "t":
      return "toggleBrand";
    case "p":
      return "presenter";
    case "f":
      return "fullscreen";
    case "b":
      return "blur";
    case "o":
      return "overview";
    case "q":
      return "qr";
    case "?":
    case "h":
      return "help";
    default:
      if (isDigit(key) || key === "Enter" || key === "Escape") return { digit: key };
      return null;
  }
}
