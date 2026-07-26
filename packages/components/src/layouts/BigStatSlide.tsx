import { motion } from "motion/react";
import type { ReactNode } from "react";
import { AnimatedNumber, Kicker, SlideHeading, headingSize, layoutEase } from "./primitives";

export interface Stat {
  /** Numbers count up on entry; strings (like "24/7") render as-is. */
  value: number | string;
  label: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  /** Optional footnote under the label, muted and small. */
  note?: string;
}

/** Column layout by stat count: one stat is a solo hero, four wrap to a 2x2. */
function gridClass(count: number): string {
  if (count <= 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-2";
  if (count === 3) return "grid-cols-3";
  return "grid-cols-2";
}

/**
 * BigStatSlide: up to four key figures with count-up entrances, an optional
 * heading above and an optional visual (like a vendored Sparkline) beside the
 * solo-stat variant.
 */
export function BigStatSlide({
  kicker,
  title,
  stats,
  aside,
}: {
  kicker?: string;
  title?: string;
  stats: Stat[];
  /** Rendered right of a single stat or under the grid, for a sparkline or note. */
  aside?: ReactNode;
}) {
  const shown = stats.slice(0, 4);
  const solo = shown.length === 1;
  // Text volume compresses the scale: four stats with long labels/notes must
  // fit a 2x2 grid on the 720px stage, so values and copy step down together.
  const heavy = shown.length >= 3 && shown.some((s) => s.label.length + (s.note?.length ?? 0) > 60);
  const valueClass = solo
    ? "text-[160px]"
    : shown.length === 2
      ? "text-[104px]"
      : heavy
        ? "text-[56px]"
        : "text-[72px]";
  const labelClass = heavy ? "mt-3 text-lg" : "mt-4 text-xl";
  const noteClass = heavy ? "mt-1 text-sm" : "mt-1 text-base";
  return (
    <div className="flex h-full w-full flex-col justify-center">
      {kicker && <Kicker>{kicker}</Kicker>}
      {title && <SlideHeading sizeClass={headingSize(title, "medium")}>{title}</SlideHeading>}
      <div className={`${title || kicker ? "mt-12" : ""} ${solo && aside ? "flex items-center gap-16" : ""}`}>
        <div className={`grid ${gridClass(shown.length)} gap-x-12 ${heavy ? "gap-y-8" : "gap-y-14"} ${solo && aside ? "shrink-0" : ""}`}>
          {shown.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: layoutEase, delay: 0.2 + i * 0.12 }}
            >
              <div className={`font-heading ${valueClass} font-semibold leading-none tracking-[-0.03em] text-primary`}>
                <AnimatedNumber value={s.value} prefix={s.prefix} suffix={s.suffix} decimals={s.decimals} />
              </div>
              <div className={`${labelClass} break-words font-body text-text`}>{s.label}</div>
              {s.note && <div className={`${noteClass} break-words font-body text-muted`}>{s.note}</div>}
            </motion.div>
          ))}
        </div>
        {aside && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: layoutEase, delay: 0.45 }}
            className={solo ? "flex-1" : "mt-12"}
          >
            {aside}
          </motion.div>
        )}
      </div>
    </div>
  );
}
