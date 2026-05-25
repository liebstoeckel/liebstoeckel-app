import { createContext, useContext, useId, useLayoutEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";

interface StepsApi {
  step: number;
  register(id: string): void;
  unregister(id: string): void;
  orderOf(id: string): number; // 1-based, or 0 until registered
}

const StepsCtx = createContext<StepsApi | null>(null);

/** Wraps the active slide; tracks how many <Step>s it contains and the current
 *  reveal index. Reports `total` via onTotal *with its slide index* so the deck
 *  can ignore a slide that's exiting (AnimatePresence overlap). Uses layout
 *  effects so `total` is set before any keypress can advance the slide. */
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
  const [ids, setIds] = useState<string[]>([]);
  const api: StepsApi = {
    step,
    register: (id) => setIds((arr) => (arr.includes(id) ? arr : [...arr, id])),
    unregister: (id) => setIds((arr) => arr.filter((x) => x !== id)),
    orderOf: (id) => ids.indexOf(id) + 1,
  };
  useLayoutEffect(() => {
    onTotal?.(slideIndex, ids.length);
  }, [ids.length, slideIndex, onTotal]);
  return <StepsCtx.Provider value={api}>{children}</StepsCtx.Provider>;
}

/** A progressive reveal. Hidden until the deck's step reaches its order (its
 *  position among siblings). Outside a StepsProvider it's always shown. */
export function Step({ children, className }: { children?: ReactNode; className?: string }) {
  const ctx = useContext(StepsCtx);
  const id = useId();
  useLayoutEffect(() => {
    ctx?.register(id);
    return () => ctx?.unregister(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const order = ctx ? ctx.orderOf(id) : 1;
  const shown = !ctx ? true : order > 0 && ctx.step >= order;
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
