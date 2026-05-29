import type { Transition, Variants } from "motion/react";

/** Nav direction for a slide change: forward (next) or backward (prev). Fed to
 *  the variants as Motion `custom`, so directional transitions mirror on back-nav. */
export type SlideDirection = 1 | -1;

/** A built-in preset name. */
export type SlideTransitionName = "fade" | "blur" | "slide" | "zoom" | "none";

/** A slide transition expressed as Motion variants (`enter`/`center`/`exit`) plus
 *  base timing. A variant value may be `(dir: SlideDirection) => target` so the
 *  transition can mirror on the navigation direction (see `slide`). */
export interface SlideTransitionSpec {
  variants: Variants;
  transition?: Transition;
}

/** Either a built-in preset name or a custom spec. */
export type SlideTransition = SlideTransitionName | SlideTransitionSpec;

const EASE = [0.22, 1, 0.36, 1] as const;

/** Built-in presets. `enter` is the off-state a slide animates *from*, `center`
 *  is on-screen, `exit` is the off-state the leaving slide animates *to*. */
export const TRANSITIONS: Record<SlideTransitionName, SlideTransitionSpec> = {
  // Default: a light opacity cross-fade — no transform, no blur.
  fade: {
    variants: { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } },
    transition: { duration: 0.32, ease: "easeInOut" },
  },
  // The former default: opacity + a soft blur and a micro-scale.
  blur: {
    variants: {
      enter: { opacity: 0, filter: "blur(10px)", scale: 1.015 },
      center: { opacity: 1, filter: "blur(0px)", scale: 1 },
      exit: { opacity: 0, filter: "blur(10px)", scale: 0.99 },
    },
    transition: { duration: 0.5, ease: EASE },
  },
  // Directional horizontal push; mirrors on back-nav via `custom`.
  slide: {
    variants: {
      enter: (d: SlideDirection) => ({ x: d > 0 ? "100%" : "-100%", opacity: 1 }),
      center: { x: 0, opacity: 1 },
      exit: (d: SlideDirection) => ({ x: d > 0 ? "-100%" : "100%", opacity: 1 }),
    },
    transition: { duration: 0.55, ease: EASE },
  },
  // A gentle scale + fade "punch in".
  zoom: {
    variants: {
      enter: { opacity: 0, scale: 0.92 },
      center: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 1.06 },
    },
    transition: { duration: 0.45, ease: EASE },
  },
  // Instant cut — no animation.
  none: {
    variants: { enter: { opacity: 1 }, center: { opacity: 1 }, exit: { opacity: 0 } },
    transition: { duration: 0 },
  },
};

/** `prefers-reduced-motion`: strip transforms/blur, keep only a tiny opacity fade. */
const REDUCED: SlideTransitionSpec = {
  variants: { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } },
  transition: { duration: 0.12 },
};

/** The transition used when neither the slide nor the deck sets one. */
export const DEFAULT_TRANSITION: SlideTransitionName = "fade";

/** Resolve a name / custom spec / `undefined` into a concrete spec. Reduced motion
 *  always wins (accessibility); an unknown name falls back to the default. */
export function resolveTransition(t: SlideTransition | undefined, reduceMotion = false): SlideTransitionSpec {
  if (reduceMotion) return REDUCED;
  if (t == null) return TRANSITIONS[DEFAULT_TRANSITION];
  if (typeof t === "string") return TRANSITIONS[t] ?? TRANSITIONS[DEFAULT_TRANSITION];
  return t;
}

/** On a coarse-pointer (mobile/touch) device, slide transitions are disabled by
 *  default — they're janky on a heavily down-scaled stage and snappy cuts read
 *  better there. Set `Present`'s `mobileTransitions` to opt back in. */
export function mobileTransitionsDisabled(coarse: boolean, mobileTransitions = false): boolean {
  return coarse && !mobileTransitions;
}
