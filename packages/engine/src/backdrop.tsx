import { createContext, useContext, type ComponentType, type ReactNode } from "react";
import { Atmosphere } from "@liebstoeckel/components";

/** A deck backdrop: decoration rendered once per view, behind the slide
 *  transition stack. It receives `still` on non-interactive surfaces
 *  (thumbnails, print, capture, presenter previews) and must render a
 *  deterministic, motionless frame there. `slide` is the index of the slide it
 *  is drawn behind (the current one in the deck, the shown one in a thumbnail
 *  or preview), so a backdrop can follow the talk; it is undefined where no
 *  slide is known. */
export type BackdropComponent = ComponentType<{ still?: boolean; slide?: number }>;

// Default context value = the default backdrop, so surfaces rendered outside a
// provider (a bare Deck in a test, a Thumb in isolation) still get the house look.
const BackdropContext = createContext<BackdropComponent | null>(Atmosphere);

/** Resolves a deck's `backdrop` prop for the subtree: `undefined` keeps the
 *  default Atmosphere, `null` means no backdrop at all. */
export function BackdropProvider({
  backdrop,
  children,
}: {
  backdrop?: BackdropComponent | null;
  children: ReactNode;
}) {
  return <BackdropContext.Provider value={backdrop === undefined ? Atmosphere : backdrop}>{children}</BackdropContext.Provider>;
}

/** The resolved backdrop of the current deck, or nothing. Render it inside a
 *  positioned stage-sized container, behind the slide content. */
export function Backdrop({ still = false, slide }: { still?: boolean; slide?: number }) {
  const C = useContext(BackdropContext);
  return C ? <C still={still} slide={slide} /> : null;
}
