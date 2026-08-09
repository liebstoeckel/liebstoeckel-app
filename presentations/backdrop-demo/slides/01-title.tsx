import { TitleSlide } from "@liebstoeckel/components";

export const notes = "The whole sky behind this deck is one custom backdrop component; it animates for the entire talk at ~zero CPU.";

export default function Title() {
  return (
    <TitleSlide
      kicker="liebstoeckel"
      title="Bring your own sky"
      subtitle="Custom deck backdrops: animated for the whole talk, invisible in your CPU graph."
      byline="The aurora behind this text is a ~100-line component in this deck's source"
    />
  );
}
