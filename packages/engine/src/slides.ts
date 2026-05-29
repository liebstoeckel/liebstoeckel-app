import type { ComponentType, ReactNode } from "react";
import type { SlideTransition } from "./transitions";

// A slide is either a bare component, or a module namespace with optional
// `notes` (MDX: `export const notes = ...`; TSX: `export const notes`) and an
// optional per-slide `transition` override (`export const transition = "slide"`).
export type SlideInput =
  | ComponentType
  | { default: ComponentType; notes?: ReactNode; transition?: SlideTransition };

export type NormalizedSlide = { Component: ComponentType; notes?: ReactNode; transition?: SlideTransition };

export function normalizeSlides(slides: SlideInput[]): NormalizedSlide[] {
  return slides.map((s) =>
    typeof s === "function"
      ? { Component: s }
      : { Component: s.default, notes: s.notes, transition: s.transition },
  );
}
