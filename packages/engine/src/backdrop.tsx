import { createContext, useContext, useMemo, type ComponentType, type ReactNode } from "react";
import { Atmosphere } from "@liebstoeckel/components";
import { normalizeSlides, type SlideInput } from "./slides";

/** A deck backdrop: decoration rendered once per view, behind the slide
 *  transition stack. It receives `still` on non-interactive surfaces
 *  (thumbnails, print, capture, presenter previews) and must render a
 *  deterministic, motionless frame there. `slide` is the 0-based index of the
 *  slide it is drawn behind (the current one in the deck, the shown one in a
 *  thumbnail or preview), so a backdrop can follow the talk; it is undefined
 *  where no slide is known.
 *
 *  `P` are the backdrop's own props, which each slide may set with
 *  `export const backdropProps`. They arrive only where a slide sets them, so
 *  every one of them must be optional. */
export type BackdropComponent<P extends object = object> = ComponentType<P & { still?: boolean; slide?: number }>;

// Default context value = the default backdrop, so surfaces rendered outside a
// provider (a bare Deck in a test, a Thumb in isolation) still get the house look.
const BackdropContext = createContext<BackdropComponent | null>(Atmosphere);
// Each slide's `backdropProps`, by slide index.
const SlidePropsContext = createContext<readonly (object | undefined)[]>([]);

/** Resolves a deck's `backdrop` prop for the subtree: `undefined` keeps the
 *  default Atmosphere, `null` means no backdrop at all. `slides` supplies each
 *  slide's `backdropProps`; without it, the slides of an outer provider count.
 *  `backdrop` does not carry over that way: leaving it out means the default. */
export function BackdropProvider({
  backdrop,
  slides,
  children,
}: {
  backdrop?: BackdropComponent | null;
  slides?: SlideInput[];
  children: ReactNode;
}) {
  const outer = useContext(SlidePropsContext);
  const perSlide = useMemo(() => (slides ? normalizeSlides(slides).map((s) => s.backdropProps) : outer), [slides, outer]);
  return (
    <BackdropContext.Provider value={backdrop === undefined ? Atmosphere : backdrop}>
      <SlidePropsContext.Provider value={perSlide}>{children}</SlidePropsContext.Provider>
    </BackdropContext.Provider>
  );
}

/** The resolved backdrop of the current deck, or nothing, drawn for `slide` with
 *  that slide's `backdropProps`. Render it inside a positioned stage-sized
 *  container, behind the slide content. */
export function Backdrop({ still = false, slide }: { still?: boolean; slide?: number }) {
  const C = useContext(BackdropContext);
  const perSlide = useContext(SlidePropsContext);
  const own = slide === undefined ? undefined : perSlide[slide];
  return C ? <C {...own} still={still} slide={slide} /> : null;
}
