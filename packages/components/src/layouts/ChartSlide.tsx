import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Caption, Kicker, SlideHeading, layoutEase } from "./primitives";

/**
 * ChartSlide: the standard data slide, a heading column on the left and the
 * framed visual on the right. The chart (usually a vendored registry chart)
 * is passed as children; `insight` renders as the caption takeaway.
 */
export function ChartSlide({
  kicker,
  title,
  insight,
  aside,
  children,
}: {
  kicker?: string;
  title: string;
  /** The one-sentence takeaway the audience should leave with. */
  insight?: string;
  /** Extra left-column content under the insight, like a legend. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full w-full items-center gap-12">
      <div className="w-[33%] shrink-0">
        {kicker && <Kicker>{kicker}</Kicker>}
        <SlideHeading sizeClass="text-[52px]">{title}</SlideHeading>
        {insight && <Caption className="max-w-md">{insight}</Caption>}
        {aside && <div className="mt-8">{aside}</div>}
      </div>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease: layoutEase, delay: 0.1 }}
        className="flex flex-1 items-center justify-center overflow-hidden rounded-3xl border border-border bg-surface/30 p-6 backdrop-blur-sm"
      >
        {children}
      </motion.div>
    </div>
  );
}
