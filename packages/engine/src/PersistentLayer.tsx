import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { motion } from "motion/react";

export type PersistentItem = { id: string; render: () => ReactNode };
type Rect = { top: number; left: number; width: number; height: number };

type Ctx = {
  register: (id: string, rect: Rect) => void;
  update: (id: string, rect: Rect) => void;
  unregister: (id: string) => void;
  rects: Record<string, Rect>;
  visible: Record<string, boolean>;
};
const PersistentCtx = createContext<Ctx | null>(null);
const usePersistent = () => {
  const c = useContext(PersistentCtx);
  if (!c) throw new Error("Slot/PersistentLayer must be used inside <PersistentProvider>");
  return c;
};

const same = (a: Rect | undefined, b: Rect) =>
  a && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;

/** Holds the live slot rects + visibility. Visibility is ref-counted: an element
 *  shows while ≥1 slot with its id is mounted. With overlapping slide transitions
 *  (AnimatePresence default), the incoming slot mounts before the outgoing one
 *  unmounts, so the count never hits 0 → the element travels smoothly instead of
 *  blinking. Rect is "last writer wins" → the incoming slot's position. */
export function PersistentProvider({ children }: { children: ReactNode }) {
  const [rects, setRects] = useState<Record<string, Rect>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const counts = useRef<Record<string, number>>({});

  const register = useCallback((id: string, rect: Rect) => {
    counts.current[id] = (counts.current[id] ?? 0) + 1;
    setRects((p) => (same(p[id], rect) ? p : { ...p, [id]: rect }));
    setVisible((p) => (p[id] ? p : { ...p, [id]: true }));
  }, []);

  const update = useCallback((id: string, rect: Rect) => {
    setRects((p) => (same(p[id], rect) ? p : { ...p, [id]: rect }));
  }, []);

  const unregister = useCallback((id: string) => {
    counts.current[id] = Math.max(0, (counts.current[id] ?? 1) - 1);
    if (counts.current[id] === 0) setVisible((p) => ({ ...p, [id]: false }));
  }, []);

  return (
    <PersistentCtx.Provider value={{ register, update, unregister, rects, visible }}>
      {children}
    </PersistentCtx.Provider>
  );
}

/** Reserves space inside a slide and reports its box to the persistent layer.
 *  Drop the same `id` on multiple slides to make the element travel between them. */
export function Slot({ id, className }: { id: string; className?: string }) {
  const { register, update, unregister } = usePersistent();
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current!;
    const root = (el.closest("[data-deck-root]") as HTMLElement) ?? document.body;
    const measure = (): Rect => {
      const r = el.getBoundingClientRect();
      const base = root.getBoundingClientRect();
      return { top: r.top - base.top, left: r.left - base.left, width: r.width, height: r.height };
    };
    register(id, measure());
    const ro = new ResizeObserver(() => update(id, measure()));
    ro.observe(el);
    ro.observe(root);
    const onResize = () => update(id, measure());
    window.addEventListener("resize", onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      unregister(id);
    };
  }, [id, register, update, unregister]);

  return <div ref={ref} data-slot={id} className={className} />;
}

/** Renders each persistent element ONCE (never unmounts → internal state kept),
 *  positioning it onto its active slot and FLIP-animating between slots. */
export function PersistentLayer({ items }: { items: PersistentItem[] }) {
  const { rects, visible } = usePersistent();
  return (
    <div className="pointer-events-none absolute inset-0">
      {items.map((it) => {
        const r = rects[it.id];
        const show = !!r && !!visible[it.id];
        return (
          <motion.div
            key={it.id}
            layout
            data-persistent={it.id}
            initial={false}
            animate={{ opacity: show ? 1 : 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 26 }}
            style={{
              position: "absolute",
              top: r?.top ?? 0,
              left: r?.left ?? 0,
              width: r?.width ?? 0,
              height: r?.height ?? 0,
              pointerEvents: show ? "auto" : "none",
            }}
          >
            {it.render()}
          </motion.div>
        );
      })}
    </div>
  );
}
