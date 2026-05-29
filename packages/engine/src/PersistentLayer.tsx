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
import { StageScaleContext } from "./Stage";
import { SlideIndexContext } from "./steps";

export type PersistentItem = { id: string; render: () => ReactNode };
type Rect = { top: number; left: number; width: number; height: number };

// Per element id, the measured slot rect for each slide index that mounts one.
type SlotMap = Record<string, Record<number, Rect>>;

type Ctx = {
  set: (id: string, slide: number, rect: Rect) => void;
  clear: (id: string, slide: number) => void;
  slots: SlotMap;
};
const PersistentCtx = createContext<Ctx | null>(null);
const usePersistent = () => {
  const c = useContext(PersistentCtx);
  if (!c) throw new Error("Slot/PersistentLayer must be used inside <PersistentProvider>");
  return c;
};

const same = (a: Rect | undefined, b: Rect) =>
  a && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;

/** Holds each persistent element's slot rect **per slide index**. Visibility is
 *  decided by the layer from the *current* slide index (not by ref-counting mounted
 *  slots) — so when navigating to a slide that has no slot, the element hides at the
 *  index change, in step with the transition, instead of lingering until the old
 *  slide finishes its exit. When the incoming slide also has a slot, its rect is
 *  present for the new index and the element travels to it. */
export function PersistentProvider({ children }: { children: ReactNode }) {
  const [slots, setSlots] = useState<SlotMap>({});

  const set = useCallback((id: string, slide: number, rect: Rect) => {
    setSlots((p) => {
      if (same(p[id]?.[slide], rect)) return p;
      return { ...p, [id]: { ...(p[id] ?? {}), [slide]: rect } };
    });
  }, []);

  const clear = useCallback((id: string, slide: number) => {
    setSlots((p) => {
      if (!p[id] || !(slide in p[id]!)) return p;
      const next = { ...p[id] };
      delete next[slide];
      return { ...p, [id]: next };
    });
  }, []);

  return <PersistentCtx.Provider value={{ set, clear, slots }}>{children}</PersistentCtx.Provider>;
}

/** Reserves space inside a slide and reports its box (per slide index) to the
 *  persistent layer. Drop the same `id` on multiple slides to make the element
 *  travel between them. */
export function Slot({ id, className }: { id: string; className?: string }) {
  const { set, clear } = usePersistent();
  const slide = useContext(SlideIndexContext);
  const scale = useContext(StageScaleContext);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current!;
    const root = (el.closest("[data-deck-root]") as HTMLElement) ?? document.body;
    // getBoundingClientRect is post-transform (device px), but the persistent layer
    // positions inside the stage's LOGICAL 1280×720 space — divide the stage scale
    // back out, else the element is mis-placed whenever the stage isn't at 1:1.
    const s = scale || 1;
    const measure = (): Rect => {
      const r = el.getBoundingClientRect();
      const base = root.getBoundingClientRect();
      return { top: (r.top - base.top) / s, left: (r.left - base.left) / s, width: r.width / s, height: r.height / s };
    };
    set(id, slide, measure());
    const ro = new ResizeObserver(() => set(id, slide, measure()));
    ro.observe(el);
    ro.observe(root);
    const onResize = () => set(id, slide, measure());
    window.addEventListener("resize", onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      clear(id, slide);
    };
  }, [id, slide, set, clear, scale]);

  return <div ref={ref} data-slot={id} className={className} />;
}

const SPRING = { type: "spring", stiffness: 200, damping: 26 } as const;
// Appear: snap the box into place (no positional tween) and only fade opacity in,
// so the element doesn't fly in from a previous slot's position or the origin.
const APPEAR = {
  top: { duration: 0 },
  left: { duration: 0 },
  width: { duration: 0 },
  height: { duration: 0 },
  opacity: SPRING,
} as const;

/** Renders each persistent element ONCE (never unmounts → internal state kept),
 *  positioning it onto the slot on the **current** slide. Animates the box props
 *  (top/left/width/height) directly rather than Motion `layout` FLIP, whose
 *  projection mis-positions under the stage's scaled ancestor. Coordinates are the
 *  slot's LOGICAL rect. When the current slide has no slot the element fades out in
 *  place. The positional spring runs only for consecutive slot→slot travel; an
 *  appearance (first show, or coming from a slot-less slide) snaps + fades in.
 *  `currentIndex` is omitted only for standalone use (then any slot shows). */
export function PersistentLayer({ items, currentIndex }: { items: PersistentItem[]; currentIndex?: number }) {
  const { slots } = usePersistent();
  const last = useRef<Record<string, Rect>>({});

  // Track the index we navigated FROM. Updated in render but ONLY when the index
  // actually changes, so the transient re-renders that land the incoming slot's
  // rect (same currentIndex) keep reporting the real previous slide. Robust against
  // effect-flush timing, unlike a useEffect-updated ref.
  const nav = useRef<{ current?: number; from?: number }>({ current: currentIndex, from: currentIndex });
  if (nav.current.current !== currentIndex) {
    nav.current = { current: currentIndex, from: nav.current.current };
  }
  const cameFrom = nav.current.from;

  const resolved = items.map((it) => {
    const perSlide = slots[it.id];
    const active = perSlide ? (currentIndex != null ? perSlide[currentIndex] : Object.values(perSlide)[0]) : undefined;
    if (active) last.current[it.id] = active;
    const r = active ?? last.current[it.id];
    const show = !!active;
    // Travel only if the slide we came FROM also had this slot; otherwise (first
    // show, or from a slot-less slide) snap + fade in instead of flying across.
    const cameFromSlot = perSlide != null && cameFrom != null && perSlide[cameFrom] != null;
    const appearing = show && !cameFromSlot;
    return { it, r, show, appearing };
  });

  return (
    <div className="pointer-events-none absolute inset-0">
      {resolved.map(({ it, r, show, appearing }) => (
        <motion.div
          key={it.id}
          data-persistent={it.id}
          initial={false}
          animate={{
            top: r?.top ?? 0,
            left: r?.left ?? 0,
            width: r?.width ?? 0,
            height: r?.height ?? 0,
            opacity: show ? 1 : 0,
          }}
          transition={appearing ? APPEAR : SPRING}
          style={{ position: "absolute", pointerEvents: show ? "auto" : "none" }}
        >
          {it.render()}
        </motion.div>
      ))}
    </div>
  );
}
