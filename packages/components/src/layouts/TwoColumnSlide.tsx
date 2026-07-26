import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Kicker, SlideHeading, headingSize, layoutEase } from "./primitives";
import type { Bullet } from "./BulletsSlide";

export interface Column {
  heading?: string;
  text?: string;
  bullets?: (string | Bullet)[];
  /** Free-form content for hand-authored slides; wins over the structured fields. */
  children?: ReactNode;
}

function ColumnBody({ column, delay }: { column: Column; delay: number }) {
  if (column.children) return <>{column.children}</>;
  const items = (column.bullets ?? []).map((b) => (typeof b === "string" ? { text: b } : b));
  return (
    <>
      {column.text && <p className="break-words font-body text-xl leading-relaxed text-muted">{column.text}</p>}
      {items.length > 0 && (
        <ul className={`${column.text ? "mt-6" : ""} space-y-3.5`}>
          {items.map((b, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.45, ease: layoutEase, delay: delay + i * 0.08 }}
              className="flex min-w-0 gap-3"
            >
              <span className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <div className="min-w-0">
                <p className="break-words font-body text-lg leading-snug text-text">{b.text}</p>
                {b.detail && <p className="mt-0.5 break-words font-body text-base leading-snug text-muted">{b.detail}</p>}
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * TwoColumnSlide: a heading over two balanced columns, each a small heading
 * plus text and/or bullets. Made for comparisons ("today / tomorrow") and
 * pairings ("problem / approach").
 */
export function TwoColumnSlide({
  kicker,
  title,
  left,
  right,
}: {
  kicker?: string;
  title: string;
  left: Column;
  right: Column;
}) {
  return (
    <div className="flex h-full w-full flex-col justify-center">
      {kicker && <Kicker>{kicker}</Kicker>}
      <SlideHeading sizeClass={headingSize(title, "medium")}>{title}</SlideHeading>
      <div className="mt-12 grid grid-cols-2 gap-12">
        {[left, right].map((col, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: layoutEase, delay: 0.25 + i * 0.12 }}
            className="border-t border-border pt-6"
          >
            {col.heading && (
              <h3 className="mb-4 font-mono text-sm uppercase tracking-[0.25em] text-accent">{col.heading}</h3>
            )}
            <ColumnBody column={col} delay={0.4 + i * 0.12} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
