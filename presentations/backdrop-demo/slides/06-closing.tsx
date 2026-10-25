import { ClosingSlide } from "@liebstoeckel/components";

export const notes =
  "Press O for the overview: every thumbnail is frozen, and each shows its own slide's sky, the moon at its height and the warm curtains only behind the slide that asked for them.";

export default function Closing() {
  return (
    <ClosingSlide
      title="Your deck, your weather"
      subtitle="Press O: every thumbnail freezes its own slide's sky."
      url="liebstoeckel.app"
    />
  );
}
