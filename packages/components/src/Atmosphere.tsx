// Layered atmosphere: two soft gradient blooms (brand glow colors), an accent
// hairline, and a vignette. Pure decoration, behind all content, brand-aware
// via --brand-glow-* / --brand-accent. The default backdrop of a deck.
//
// Deliberately cheap: the blooms are unfiltered radial gradients (their
// softness is the gradient falloff itself, not a blur filter, so nothing here
// forces a per-frame re-raster), and nothing animates unless `drift` is set.
// `drift` is a CSS keyframes transform: it runs entirely on the compositor
// with no per-frame JS, is throttled by the browser in hidden tabs, and is
// disabled under prefers-reduced-motion.
//
// `still` renders the motionless variant regardless of `drift`, used by the
// build-time thumbnail capture, print, and preview surfaces, so a screenshot
// is deterministic and an overview never runs N animations.

const DRIFT_CSS = `
@keyframes lst-atmo-drift-a {
  0%, 100% { transform: translate(0, 0) }
  50% { transform: translate(40px, 30px) }
}
@keyframes lst-atmo-drift-b {
  0%, 100% { transform: translate(0, 0) }
  50% { transform: translate(-50px, -20px) }
}
.lst-atmo-drift-a { animation: lst-atmo-drift-a 22s ease-in-out infinite }
.lst-atmo-drift-b { animation: lst-atmo-drift-b 28s ease-in-out infinite }
@media (prefers-reduced-motion: reduce) {
  .lst-atmo-drift-a, .lst-atmo-drift-b { animation: none }
}
`;

export function Atmosphere({ still = false, drift = false }: { still?: boolean; drift?: boolean }) {
  const drifting = drift && !still;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {drifting && <style>{DRIFT_CSS}</style>}
      <div
        className={`absolute -left-[15%] -top-[20%] h-[560px] w-[560px] rounded-full ${drifting ? "lst-atmo-drift-a" : ""}`}
        style={{ background: "radial-gradient(circle, var(--brand-glow-a, #1b3a4b), transparent 70%)", opacity: 0.5 }}
      />
      <div
        className={`absolute -bottom-[25%] -right-[10%] h-[520px] w-[520px] rounded-full ${drifting ? "lst-atmo-drift-b" : ""}`}
        style={{ background: "radial-gradient(circle, var(--brand-glow-b, #2a1f3d), transparent 70%)", opacity: 0.5 }}
      />
      {/* faint accent hairline bloom near top */}
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, var(--brand-accent), transparent)", opacity: 0.35 }}
      />
      {/* vignette */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 120% at 50% 40%, transparent 55%, rgba(0,0,0,0.55))" }}
      />
    </div>
  );
}
