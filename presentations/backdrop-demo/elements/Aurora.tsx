// A deck backdrop: a night sky with drifting aurora curtains and twinkling
// stars, animated for the whole talk at effectively zero CPU.
//
// The trick is the same one the engine's default Atmosphere uses, pushed
// further: every moving part animates ONLY transform and opacity, via CSS
// keyframes. Both properties are composited on the GPU, so once the layers
// are painted the main thread does nothing per frame: no filter re-raster,
// no JS animation tick. The soft curtain edges come from gradient falloff,
// never from a blur filter (an animated filtered layer is what made the old
// always-on atmosphere expensive).
//
// The engine passes `still` on capture, print, thumbnail, and presenter
// preview surfaces; rendering motionless there keeps screenshots
// deterministic. prefers-reduced-motion is honored in the CSS itself.
//
// It also follows the talk. `slide` (the index of the slide it is drawn
// behind) lifts the moon one step per slide, and a slide can set the sky's
// `palette` itself with `export const backdropProps = { palette: "ember" }`.
// Both reach thumbnails and print too, so each one shows its own slide's sky.
// The moon moves by transform and the palettes crossfade by opacity, so
// following the talk costs nothing either.

import type { BackdropComponent } from "@liebstoeckel/engine";

/** What a slide can set for the sky. */
export type AuroraProps = { palette?: "polar" | "ember" };

const SKY = "radial-gradient(130% 100% at 50% 100%, #0a1626 0%, #050b14 55%, #02060c 100%)";

const CURTAINS = [
  { className: "aurora-sway-a", left: "2%", width: "40%", tilt: "-14deg" },
  { className: "aurora-sway-b", left: "30%", width: "46%", tilt: "-8deg" },
  { className: "aurora-sway-c", left: "58%", width: "40%", tilt: "-18deg" },
] as const;

// One color per curtain, for each palette.
const PALETTES = {
  polar: ["rgba(61, 233, 179, 0.30)", "rgba(74, 222, 128, 0.22)", "rgba(167, 139, 250, 0.24)"],
  ember: ["rgba(251, 191, 36, 0.36)", "rgba(251, 113, 133, 0.32)", "rgba(249, 115, 22, 0.32)"],
} as const;

// The moon starts low and climbs this far with every slide, up to MOON_TOP steps,
// so a long deck keeps it on screen.
const MOON_STEP = 46;
const MOON_TOP = 8;

// Two star layers drawn once as box-shadow dots; twinkle is an opacity
// breath on each whole layer, phase-shifted so it never pulses in sync.
const dots = (seed: number, count: number): string => {
  let s = seed;
  const rand = () => {
    // Deterministic LCG so the sky is identical on every render and surface.
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
  return Array.from({ length: count }, () => {
    const x = Math.round(rand() * 1280);
    const y = Math.round(rand() * 500);
    const size = rand() > 0.85 ? 1.5 : 1;
    return `${x}px ${y}px 0 ${size}px rgba(226, 240, 255, ${(0.25 + rand() * 0.5).toFixed(2)})`;
  }).join(", ");
};

const STARS_A = dots(7, 46);
const STARS_B = dots(1234, 38);

const AURORA_CSS = `
@keyframes aurora-sway-a {
  0%, 100% { transform: skewX(-14deg) translateX(0) scaleY(1) }
  50% { transform: skewX(-11deg) translateX(46px) scaleY(1.08) }
}
@keyframes aurora-sway-b {
  0%, 100% { transform: skewX(-8deg) translateX(0) scaleY(1.05) }
  50% { transform: skewX(-12deg) translateX(-60px) scaleY(0.96) }
}
@keyframes aurora-sway-c {
  0%, 100% { transform: skewX(-18deg) translateX(0) scaleY(1) }
  50% { transform: skewX(-14deg) translateX(38px) scaleY(1.12) }
}
@keyframes aurora-breathe {
  0%, 100% { opacity: 0.55 }
  50% { opacity: 1 }
}
@keyframes aurora-twinkle-a {
  0%, 100% { opacity: 0.9 }
  50% { opacity: 0.45 }
}
@keyframes aurora-twinkle-b {
  0%, 100% { opacity: 0.4 }
  50% { opacity: 0.85 }
}
.aurora-sway-a { animation: aurora-sway-a 26s ease-in-out infinite, aurora-breathe 19s ease-in-out infinite }
.aurora-sway-b { animation: aurora-sway-b 34s ease-in-out infinite, aurora-breathe 23s ease-in-out -8s infinite }
.aurora-sway-c { animation: aurora-sway-c 30s ease-in-out infinite, aurora-breathe 17s ease-in-out -4s infinite }
.aurora-twinkle-a { animation: aurora-twinkle-a 7s ease-in-out infinite }
.aurora-twinkle-b { animation: aurora-twinkle-b 9s ease-in-out -3s infinite }
.aurora-moon { transition: transform 1.6s cubic-bezier(0.22, 0.61, 0.27, 1) }
.aurora-palette { transition: opacity 1.4s ease-in-out }
@media (prefers-reduced-motion: reduce) {
  .aurora-sway-a, .aurora-sway-b, .aurora-sway-c, .aurora-twinkle-a, .aurora-twinkle-b { animation: none }
  .aurora-moon, .aurora-palette { transition: none }
}
`;

export const Aurora: BackdropComponent<AuroraProps> = ({ still = false, slide = 0, palette = "polar" }) => {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: SKY }}>
      {!still && <style>{AURORA_CSS}</style>}
      {/* star field: two phase-shifted layers, painted once as box-shadows */}
      <div
        className={still ? "" : "aurora-twinkle-a"}
        style={{ position: "absolute", top: 0, left: 0, width: 1, height: 1, borderRadius: "50%", boxShadow: STARS_A }}
      />
      <div
        className={still ? "" : "aurora-twinkle-b"}
        style={{ position: "absolute", top: 0, left: 0, width: 1, height: 1, borderRadius: "50%", boxShadow: STARS_B }}
      />
      {/* the moon: one transform per slide, eased by a compositor-only transition */}
      <div
        className={still ? "" : "aurora-moon"}
        style={{
          position: "absolute",
          // in the right margin, clear of every slide's content column
          top: 470,
          right: 30,
          width: 50,
          height: 50,
          borderRadius: "50%",
          background: "radial-gradient(circle at 38% 36%, #f4f1e4 0%, #d9d4c0 58%, #b8b29c 100%)",
          boxShadow: "0 0 40px 10px rgba(226, 240, 255, 0.16)",
          transform: `translateY(${-Math.min(slide, MOON_TOP) * MOON_STEP}px)`,
        }}
      />
      {/* aurora curtains, one set per palette: the slide's palette fades in, the other out */}
      {(Object.keys(PALETTES) as (keyof typeof PALETTES)[]).map((name) => (
        <div
          key={name}
          className={still ? "" : "aurora-palette"}
          style={{ position: "absolute", inset: 0, opacity: name === palette ? 1 : 0 }}
        >
          {CURTAINS.map((c, i) => (
            <div
              key={i}
              className={still ? "" : c.className}
              style={{
                position: "absolute",
                top: "-12%",
                bottom: "30%",
                left: c.left,
                width: c.width,
                transform: still ? `skewX(${c.tilt})` : undefined,
                transformOrigin: "50% 0%",
                // A soft ellipse fading out in every direction: the wispy edge is
                // pure gradient falloff, cheap to paint and free to move.
                background: `radial-gradient(50% 85% at 50% 18%, ${PALETTES[name][i]} 0%, transparent 72%)`,
              }}
            />
          ))}
        </div>
      ))}
      {/* horizon glow + vignette keep text legible over the bright bands */}
      <div
        className="absolute inset-x-0 bottom-0 h-1/3"
        style={{ background: "linear-gradient(180deg, transparent, rgba(2, 6, 12, 0.85))" }}
      />
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 120% at 50% 40%, transparent 55%, rgba(0, 0, 0, 0.5))" }}
      />
    </div>
  );
};
