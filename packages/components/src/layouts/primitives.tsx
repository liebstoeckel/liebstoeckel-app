import { useEffect, useState, type ReactNode } from "react";
import { animate, motion, useMotionValue } from "motion/react";

/** Shared entrance easing for the layout components (a soft settle). */
export const layoutEase = [0.22, 1, 0.36, 1] as const;

/** Small mono overline with the brand accent, announces the slide topic. */
export function Kicker({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: layoutEase }}
      className="mb-5 flex items-center gap-3 font-mono text-[13px] uppercase tracking-[0.35em] text-accent"
    >
      <span className="h-px w-8 bg-accent" />
      {children}
    </motion.div>
  );
}

/** Pick a heading size class by text length so generated titles never overflow.
 *  `scale` shifts the whole ramp down for layouts with less room. */
export function headingSize(text: string, scale: "hero" | "large" | "medium" = "large"): string {
  const n = text.length;
  if (scale === "hero") {
    if (n <= 18) return "text-[112px]";
    if (n <= 34) return "text-[88px]";
    if (n <= 60) return "text-[68px]";
    return "text-[52px]";
  }
  if (scale === "large") {
    if (n <= 24) return "text-[72px]";
    if (n <= 48) return "text-[56px]";
    return "text-[44px]";
  }
  if (n <= 30) return "text-[52px]";
  if (n <= 60) return "text-[42px]";
  return "text-[34px]";
}

/** Slide heading in the brand display face, with the standard rise-in. */
export function SlideHeading({
  children,
  sizeClass = "text-[56px]",
  className = "",
  delay = 0.06,
}: {
  children: ReactNode;
  sizeClass?: string;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.h2
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: layoutEase, delay }}
      className={`font-heading ${sizeClass} break-words font-semibold leading-[0.98] tracking-[-0.02em] text-text ${className}`}
    >
      {children}
    </motion.h2>
  );
}

/** Muted supporting paragraph under a heading. */
export function Caption({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className={`mt-6 max-w-xl break-words font-body text-xl leading-relaxed text-muted ${className}`}
    >
      {children}
    </motion.p>
  );
}

/** Counts up to `value` on mount. Strings render as-is (for values like "24/7"). */
export function AnimatedNumber({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
}: {
  value: number | string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const target = typeof value === "number" ? value : 0;
  const mv = useMotionValue(0);
  const [d, setD] = useState(0);
  useEffect(() => {
    if (typeof value !== "number") return;
    const c = animate(mv, target, { duration: 1.3, ease: layoutEase, onUpdate: (v) => setD(v) });
    return () => c.stop();
  }, [value, target, mv]);
  return (
    <span className="tabular-nums">
      {prefix}
      {typeof value === "number" ? d.toFixed(decimals) : value}
      {suffix}
    </span>
  );
}
