import { motion } from "motion/react";
import { Kicker, SlideHeading, headingSize, layoutEase } from "./primitives";

/**
 * TitleSlide, the deck opener: kicker, oversized display title, subtitle and an
 * optional byline row. The heading size adapts to the title length so long
 * generated titles never clip.
 */
export function TitleSlide({
  kicker,
  title,
  subtitle,
  byline,
  date,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  byline?: string;
  date?: string;
}) {
  return (
    <div className="flex h-full w-full flex-col justify-center">
      {kicker && <Kicker>{kicker}</Kicker>}
      <SlideHeading sizeClass={headingSize(title, "hero")} delay={0.1}>
        {title}
      </SlideHeading>
      {subtitle && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.4 }}
          className="mt-8 max-w-2xl break-words font-body text-2xl leading-relaxed text-muted"
        >
          {subtitle}
        </motion.p>
      )}
      {(byline || date) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: layoutEase, delay: 0.55 }}
          className="mt-14 flex items-center gap-4 font-mono text-sm uppercase tracking-[0.2em] text-muted"
        >
          {byline && <span>{byline}</span>}
          {byline && date && <span className="h-1 w-1 rounded-full bg-accent" />}
          {date && <span>{date}</span>}
        </motion.div>
      )}
    </div>
  );
}
