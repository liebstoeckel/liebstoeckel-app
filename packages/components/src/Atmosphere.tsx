import { motion } from "motion/react";

// Layered atmosphere: two slow-drifting gradient blooms (brand glow colors),
// a fine film-grain overlay (SVG turbulence), and a vignette. Pure decoration,
// behind all content. Brand-aware via --brand-glow-* / --brand-accent.
//
// `still` renders the motionless variant (no infinite drift) — used by the
// build-time thumbnail capture and static thumbnails, so a screenshot is
// deterministic and the overview never runs N infinite animations.
export function Atmosphere({ still = false }: { still?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute -left-[15%] -top-[20%] h-[70vh] w-[70vh] rounded-full blur-[120px]"
        style={{ background: "radial-gradient(circle, var(--brand-glow-a, #1b3a4b), transparent 70%)", opacity: 0.5 }}
        animate={still ? undefined : { x: [0, 40, 0], y: [0, 30, 0] }}
        transition={still ? undefined : { duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-[25%] -right-[10%] h-[65vh] w-[65vh] rounded-full blur-[120px]"
        style={{ background: "radial-gradient(circle, var(--brand-glow-b, #2a1f3d), transparent 70%)", opacity: 0.5 }}
        animate={still ? undefined : { x: [0, -50, 0], y: [0, -20, 0] }}
        transition={still ? undefined : { duration: 28, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* faint accent hairline bloom near top */}
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, var(--brand-accent), transparent)", opacity: 0.35 }}
      />
      {/* film grain — tagged so the vector-PDF print view can drop it (an
          feTurbulence layer rasterizes to a huge full-page bitmap in print). */}
      <svg data-atmosphere-grain className="absolute inset-0 h-full w-full opacity-[0.05] mix-blend-overlay">
        <filter id="atmo-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#atmo-grain)" />
      </svg>
      {/* vignette */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 120% at 50% 40%, transparent 55%, rgba(0,0,0,0.55))" }}
      />
    </div>
  );
}
