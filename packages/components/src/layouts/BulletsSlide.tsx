import { motion } from "motion/react";
import { Kicker, SlideHeading, headingSize, layoutEase } from "./primitives";

export interface Bullet {
  text: string;
  /** Optional second line, rendered muted under the main text. */
  detail?: string;
}

/**
 * BulletsSlide: heading plus a staggered list. Accepts plain strings or
 * `{ text, detail }` pairs. The layout scales with content volume: long lists
 * compress their type, and genuinely heavy lists (many long bullets) flow
 * into two columns so the slide never overflows vertically.
 */
export function BulletsSlide({
  kicker,
  title,
  bullets,
}: {
  kicker?: string;
  title: string;
  bullets: (string | Bullet)[];
}) {
  const items = bullets.map((b) => (typeof b === "string" ? { text: b } : b));
  const load = items.reduce((n, b) => n + b.text.length + (b.detail?.length ?? 0), 0);
  const dense = items.length > 4 || items.some((b) => b.detail);
  // Past this volume a single column cannot fit 1280x720 at a legible size.
  const heavy = load > 520 && items.length >= 4;

  const item = (b: Bullet, i: number) => (
    <motion.li
      key={i}
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: layoutEase, delay: 0.25 + i * 0.09 }}
      className="flex min-w-0 gap-4"
    >
      <span className="mt-[0.65em] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
      <div className="min-w-0">
        <p className={`font-body ${heavy ? "text-base" : dense ? "text-xl" : "text-2xl"} break-words leading-snug text-text`}>
          {b.text}
        </p>
        {b.detail && (
          <p className={`mt-1 break-words font-body ${heavy ? "text-sm" : "text-lg"} leading-snug text-muted`}>
            {b.detail}
          </p>
        )}
      </div>
    </motion.li>
  );

  return (
    <div className="flex h-full w-full flex-col justify-center">
      {kicker && <Kicker>{kicker}</Kicker>}
      <SlideHeading sizeClass={headingSize(title, heavy ? "medium" : "large")}>{title}</SlideHeading>
      {heavy ? (
        <ul className="mt-8 grid grid-cols-2 gap-x-14 gap-y-3">{items.map(item)}</ul>
      ) : (
        <ul className={`${dense ? "mt-10 space-y-4" : "mt-12 space-y-6"} max-w-3xl`}>{items.map(item)}</ul>
      )}
    </div>
  );
}
