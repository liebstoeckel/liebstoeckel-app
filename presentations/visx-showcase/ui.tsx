import { useEffect, useState, type ReactNode } from "react";
import { animate, motion, useMotionValue } from "motion/react";

const ease = [0.22, 1, 0.36, 1] as const;

export function Kicker({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease }}
      className="mb-5 flex items-center gap-3 font-mono text-[13px] uppercase tracking-[0.35em] text-accent"
    >
      <span className="h-px w-8 bg-accent" />
      {children}
    </motion.div>
  );
}

export function Title({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.h2
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease, delay: 0.06 }}
      className={`font-heading text-[64px] font-semibold leading-[0.98] tracking-[-0.02em] text-text ${className}`}
      style={{ fontVariationSettings: '"opsz" 100' }}
    >
      {children}
    </motion.h2>
  );
}

export function Caption({ children }: { children: ReactNode }) {
  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="mt-6 max-w-md font-body text-xl leading-relaxed text-muted"
    >
      {children}
    </motion.p>
  );
}

/** Standard chart slide: heading column on the left, framed chart on the right. */
export function ChartSlide({
  kicker,
  title,
  caption,
  aside,
  children,
}: {
  kicker: ReactNode;
  title: ReactNode;
  caption?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full w-full items-center gap-12">
      <div className="w-[33%] shrink-0">
        <Kicker>{kicker}</Kicker>
        <Title className="!text-[52px]">{title}</Title>
        {caption && <Caption>{caption}</Caption>}
        {aside && <div className="mt-8">{aside}</div>}
      </div>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease, delay: 0.1 }}
        className="flex flex-1 items-center justify-center overflow-hidden rounded-3xl border border-border bg-surface/30 p-6 backdrop-blur-sm"
      >
        {children}
      </motion.div>
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; value?: ReactNode }[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((it, i) => (
        <motion.li
          key={it.label}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 + i * 0.07 }}
          className="flex items-center gap-3 font-body text-lg text-text"
        >
          <span className="h-3 w-3 rounded-sm" style={{ background: it.color }} />
          <span className="flex-1">{it.label}</span>
          {it.value != null && <span className="font-mono text-muted">{it.value}</span>}
        </motion.li>
      ))}
    </ul>
  );
}

export function AnimatedNumber({ value, suffix = "", decimals = 0 }: { value: number; suffix?: string; decimals?: number }) {
  const mv = useMotionValue(0);
  const [d, setD] = useState(0);
  useEffect(() => {
    const c = animate(mv, value, { duration: 1.3, ease, onUpdate: (v) => setD(v) });
    return () => c.stop();
  }, [value, mv]);
  return (
    <span className="tabular-nums">
      {d.toFixed(decimals)}
      {suffix}
    </span>
  );
}
