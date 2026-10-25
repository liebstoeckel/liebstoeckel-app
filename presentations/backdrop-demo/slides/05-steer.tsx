import { BulletsSlide } from "@liebstoeckel/components";
import type { AuroraProps } from "../elements/Aurora";

export const notes =
  "The curtains warm up because this slide asks for it: it exports backdropProps. Move the slide anywhere in the deck and the warm sky moves with it.";

// This slide's own setting for the sky, handed to the backdrop wherever it is
// drawn behind this slide: in the deck, the overview, thumbnails and print.
export const backdropProps: AuroraProps = { palette: "ember" };

export default function Steer() {
  return (
    <BulletsSlide
      kicker="Following the talk"
      title="Each slide can steer the sky"
      bullets={[
        { text: "slide: where the talk is", detail: "the index of the slide behind it; the moon climbs one step per slide" },
        { text: "backdropProps: what a slide asks for", detail: "this slide exports { palette: \"ember\" }, so the curtains warm up behind it, and only here" },
        { text: "Tied to the slide, not its place", detail: "move this slide and its sky comes along; nothing is keyed by position" },
        { text: "Every surface agrees", detail: "thumbnails, print and the presenter's previews show each slide's own sky" },
      ]}
    />
  );
}
