import { motion } from "motion/react";
import { GradientArea } from "../charts/GradientArea";

export const notes = (
  <div>
    <p>
      Welcome. This deck is a <strong>live React app</strong> compiled to a single HTML file — every chart you'll
      see is <strong>visx</strong>, animated with Motion.
    </p>
    <ul>
      <li>Press <kbd>→</kbd> / <kbd>Space</kbd> to advance, <kbd>P</kbd> for this presenter view.</li>
      <li>Open on the topic: data deserves to <strong>move</strong>, not sit in a screenshot.</li>
    </ul>
  </div>
);

export default function Title() {
  return (
    <div className="relative h-full w-full">
      {/* visx motif, full-bleed behind */}
      <div className="pointer-events-none absolute -bottom-10 left-0 right-0 opacity-50">
        <GradientArea width={1280} height={380} />
      </div>

      <div className="absolute left-0 top-1/2 -translate-y-1/2">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mb-6 flex items-center gap-3 font-mono text-sm uppercase tracking-[0.4em] text-accent"
        >
          <span className="h-px w-10 bg-accent" />
          visx × present-it
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          className="font-heading text-[128px] font-semibold leading-[0.92] tracking-[-0.03em] text-text"
          style={{ fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 1' }}
        >
          Data,
          <br />
          in <span className="text-primary italic" style={{ fontVariationSettings: '"opsz" 144' }}>motion</span>.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.45 }}
          className="mt-8 max-w-xl font-body text-2xl leading-relaxed text-muted"
        >
          How beautiful a React-native presentation can be — built with Bun, Motion &amp; visx.
        </motion.p>
      </div>
    </div>
  );
}
