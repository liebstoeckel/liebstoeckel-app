import type { ComponentType, ReactNode } from "react";

// A slide is either a bare component, or a module namespace with an optional
// `notes` export (MDX: `export const notes = ...`; TSX: `export const notes`).
export type SlideInput =
  | ComponentType
  | { default: ComponentType; notes?: ReactNode };

export type NormalizedSlide = { Component: ComponentType; notes?: ReactNode };

export function normalizeSlides(slides: SlideInput[]): NormalizedSlide[] {
  return slides.map((s) =>
    typeof s === "function"
      ? { Component: s }
      : { Component: s.default, notes: s.notes },
  );
}
