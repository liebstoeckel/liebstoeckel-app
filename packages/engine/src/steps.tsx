import { createContext, useContext, useId, useLayoutEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";

interface Entry {
  id: string;
  weight: number;
}

interface StepsApi {
  step: number;
  /** Claim `weight` consecutive reveal slots (default 1). Idempotent per id. */
  register(id: string, weight?: number): void;
  unregister(id: string): void;
  /** 1-based index of the first slot this id occupies, or 0 until registered. */
  startOf(id: string): number;
}

const StepsCtx = createContext<StepsApi | null>(null);

/** The index of the slide a subtree belongs to. During the AnimatePresence overlap
 *  the exiting slide still carries its own (old) index here, so descendants, e.g.
 *  a persistent `<Slot>`, can tell whether they're on the *current* slide. -1
 *  outside any slide. */
export const SlideIndexContext = createContext(-1);

/** Wraps the active slide; tracks the total reveal slots it contains (sum of each
 *  consumer's weight) and the current reveal index. Reports `total` via onTotal
 *  *with its slide index* so the deck can ignore a slide that's exiting (the
 *  AnimatePresence overlap). Uses layout effects so `total` is set before any
 *  keypress can advance the slide. */
export function StepsProvider({
  step,
  slideIndex,
  onTotal,
  children,
}: {
  step: number;
  slideIndex: number;
  onTotal?: (slideIndex: number, total: number) => void;
  children: ReactNode;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const api: StepsApi = {
    step,
    register: (id, weight = 1) =>
      setEntries((arr) => {
        const i = arr.findIndex((e) => e.id === id);
        if (i === -1) return [...arr, { id, weight }];
        if (arr[i]!.weight === weight) return arr;
        const copy = arr.slice();
        copy[i] = { id, weight };
        return copy;
      }),
    unregister: (id) => setEntries((arr) => arr.filter((e) => e.id !== id)),
    startOf: (id) => {
      let acc = 0;
      for (const e of entries) {
        if (e.id === id) return acc + 1;
        acc += e.weight;
      }
      return 0;
    },
  };
  const total = entries.reduce((s, e) => s + e.weight, 0);
  useLayoutEffect(() => {
    onTotal?.(slideIndex, total);
  }, [total, slideIndex, onTotal]);
  return (
    <StepsCtx.Provider value={api}>
      <SlideIndexContext.Provider value={slideIndex}>{children}</SlideIndexContext.Provider>
    </StepsCtx.Provider>
  );
}

/** A progressive reveal. Hidden until the deck's step reaches its slot (its
 *  position among siblings). Outside a StepsProvider it's always shown. */
export function Step({ children, className }: { children?: ReactNode; className?: string }) {
  const ctx = useContext(StepsCtx);
  const id = useId();
  useLayoutEffect(() => {
    ctx?.register(id, 1);
    return () => ctx?.unregister(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const start = ctx ? ctx.startOf(id) : 1;
  const shown = !ctx ? true : start > 0 && ctx.step >= start;
  return (
    <motion.div
      className={className}
      initial={false}
      animate={{ opacity: shown ? 1 : 0, y: shown ? 0 : 8 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      aria-hidden={!shown}
    >
      {children}
    </motion.div>
  );
}

/** For a multi-state reveal (e.g. animated code): claims `count - 1` reveal slots
 *  and returns the active state index (0…count-1) as the deck steps through them.
 *  Outside a provider (thumbnail capture / standalone) it resolves to the final
 *  state so a static render shows the finished result. */
export function useRevealState(count: number): number {
  const ctx = useContext(StepsCtx);
  const id = useId();
  const weight = Math.max(0, count - 1);
  useLayoutEffect(() => {
    ctx?.register(id, weight);
    return () => ctx?.unregister(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weight]);
  if (!ctx) return Math.max(0, count - 1);
  const start = ctx.startOf(id);
  if (start === 0) return 0; // not registered on this render yet
  return Math.max(0, Math.min(count - 1, ctx.step - start + 1));
}
