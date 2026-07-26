import { motion } from "motion/react";
import { SlideHeading, headingSize, layoutEase } from "./primitives";

/**
 * SectionSlide, a chapter divider: an oversized index numeral ghosted behind a
 * large title. `index` is 1-based and optional; without it the divider is just
 * the title on the accent rule.
 */
export function SectionSlide({
  index,
  title,
  subtitle,
}: {
  index?: number;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="relative flex h-full w-full flex-col justify-center">
      {typeof index === "number" && (
        <motion.span
          aria-hidden
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 0.08, x: 0 }}
          transition={{ duration: 0.9, ease: layoutEase }}
          className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-heading text-[340px] font-semibold leading-none text-text"
        >
          {String(index).padStart(2, "0")}
        </motion.span>
      )}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.7, ease: layoutEase }}
        className="mb-8 h-px w-24 origin-left bg-accent"
      />
      <SlideHeading sizeClass={headingSize(title, "hero")}>{title}</SlideHeading>
      {subtitle && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-6 max-w-xl break-words font-body text-xl leading-relaxed text-muted"
        >
          {subtitle}
        </motion.p>
      )}
    </div>
  );
}
