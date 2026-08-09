import { BulletsSlide } from "@liebstoeckel/components";

export const notes = "One component, one prop. The engine renders it once, behind the slide transitions, so it never doubles up mid-transition.";

export default function How() {
  return (
    <BulletsSlide
      kicker="How it works"
      title="One prop on the deck"
      bullets={[
        { text: "backdrop={Aurora} on <Present>", detail: "a plain component; omit it for the default atmosphere, pass null for a flat background" },
        { text: "Rendered once, behind the slide stack", detail: "slides crossfade over a stable sky, so a transition never runs two skies" },
        { text: "Frozen where it should be", detail: "the engine passes still on thumbnails, print, capture, and presenter previews" },
        { text: "Respects prefers-reduced-motion", detail: "one CSS media query, no JavaScript involved" },
      ]}
    />
  );
}
