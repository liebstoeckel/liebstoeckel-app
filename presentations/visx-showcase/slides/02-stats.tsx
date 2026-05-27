import { motion } from "motion/react";
import { Kicker, Title, AnimatedNumber } from "../ui";
import { Sparkline } from "../charts/Sparkline";

export const notes = (
  <div>
    <p>Lead with the <strong>headline numbers</strong> — let them count up so the room watches them land.</p>
    <ul>
      <li>Each metric pairs with a <strong>sparkline</strong> so the trend reads instantly.</li>
      <li>Numbers animate with Motion's <code>useMotionValue</code>; sparklines are visx area charts.</li>
    </ul>
  </div>
);

const stats = [
  { label: "Monthly active", value: 248, suffix: "K", color: "var(--brand-primary)", trend: [10, 14, 12, 18, 22, 20, 28, 34, 31, 42], id: "a" },
  { label: "Avg. session", value: 6.4, suffix: " min", decimals: 1, color: "var(--brand-accent)", trend: [4, 5, 4.5, 5.5, 5, 6, 6.4, 6.1, 6.8, 6.4], id: "b" },
  { label: "Retention", value: 92, suffix: "%", color: "var(--brand-accent2)", trend: [70, 74, 78, 80, 83, 86, 88, 90, 91, 92], id: "c" },
];

export default function Stats() {
  return (
    <div className="w-full">
      <Kicker>By the numbers · Q2</Kicker>
      <Title>A strong quarter, at a glance.</Title>

      <div className="mt-14 grid grid-cols-3 gap-8">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + i * 0.12, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl border border-border bg-surface/40 p-8 backdrop-blur-sm"
          >
            <div className="font-mono text-xs uppercase tracking-[0.25em] text-muted">{s.label}</div>
            <div className="mt-3 font-heading text-[72px] font-semibold leading-none text-text" style={{ color: s.color }}>
              <AnimatedNumber value={s.value} suffix={s.suffix} decimals={s.decimals ?? 0} />
            </div>
            <div className="mt-5">
              <Sparkline id={s.id} data={s.trend} color={s.color} width={300} height={70} />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
