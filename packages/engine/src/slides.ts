import type { ComponentType, ReactNode } from "react";
import type { SlideTransition } from "./transitions";

// A slide is either a bare component, or a module namespace with optional
// `notes` (MDX: `export const notes = ...`; TSX: `export const notes`), an
// optional per-slide `transition` override (`export const transition = "slide"`)
// and optional `backdropProps`, handed to the deck's backdrop wherever it is drawn
// behind this slide (`export const backdropProps = { scene: "file" }`).
export type SlideInput =
  | ComponentType
  | { default: ComponentType; notes?: ReactNode; transition?: SlideTransition; backdropProps?: object };

export type NormalizedSlide = { Component: ComponentType; notes?: ReactNode; transition?: SlideTransition; backdropProps?: object };

export function normalizeSlides(slides: SlideInput[]): NormalizedSlide[] {
  return slides.map((s) =>
    typeof s === "function"
      ? { Component: s }
      : { Component: s.default, notes: s.notes, transition: s.transition, backdropProps: s.backdropProps },
  );
}
