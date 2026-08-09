import { TwoColumnSlide } from "@liebstoeckel/components";

export const notes =
  "Open the performance panel: the main thread is idle while three curtains sway and eighty stars twinkle. Everything animates transform and opacity only, so it all runs on the compositor.";

export default function Cheap() {
  return (
    <TwoColumnSlide
      kicker="Why it costs nothing"
      title="Animate like the compositor is watching"
      left={{
        heading: "This sky does",
        bullets: [
          { text: "transform + opacity keyframes", detail: "GPU-composited; the main thread is idle" },
          { text: "Soft edges from gradient falloff", detail: "painted once, then only moved" },
          { text: "Stars as box-shadow layers", detail: "80 dots, two layers, two animations" },
        ],
      }}
      right={{
        heading: "This sky avoids",
        bullets: [
          { text: "Animating under a blur filter", detail: "re-rasterizes a huge layer every frame" },
          { text: "Live SVG turbulence", detail: "full-page noise repainted continuously" },
          { text: "Per-frame JavaScript", detail: "no animation library ticking behind your slides" },
        ],
      }}
    />
  );
}
