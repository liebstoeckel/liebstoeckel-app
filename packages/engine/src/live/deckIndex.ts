import * as Y from "yjs";
import { useEffect, useState } from "react";
import { stepForward, stepBack } from "../delivery";

const clampN = (n: number, count: number) => Math.min(Math.max(n, 0), Math.max(count - 1, 0));

export const getDeckIndex = (doc: Y.Doc): number => (doc.getMap("deck").get("index") as number) ?? 0;
export const setDeckIndex = (doc: Y.Doc, n: number): void => {
  doc.getMap("deck").set("index", n);
};

export interface DeckController {
  index: number;
  step: number;
  total: number;
  canDrive: boolean;
  setIndex(u: number | ((n: number) => number)): void;
  setStep(step: number): void;
  setTotal(total: number): void;
  next(): void;
  prev(): void;
}

/** Deck nav state backed by the shared doc: viewers follow, only `canDrive` (the
 *  presenter role) writes. Carries index + step + total so reveals follow too. */
export function useLiveDeck(doc: Y.Doc, count: number, canDrive: boolean): DeckController {
  const map = doc.getMap<number>("deck");
  const read = () => ({
    index: (map.get("index") as number) ?? 0,
    step: (map.get("step") as number) ?? 0,
    total: (map.get("total") as number) ?? 0,
  });
  const [s, setS] = useState(read);
  useEffect(() => {
    const handler = () => setS(read());
    map.observe(handler);
    handler();
    return () => map.unobserve(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  const setIndexTo = (n: number) =>
    doc.transact(() => {
      map.set("index", clampN(n, count));
      map.set("step", 0);
    });

  return {
    ...s,
    canDrive,
    setIndex(u) {
      if (!canDrive) return;
      setIndexTo(typeof u === "function" ? u(read().index) : u);
    },
    setStep(step) {
      if (canDrive) map.set("step", step);
    },
    setTotal(total) {
      if (canDrive && read().total !== total) map.set("total", total);
    },
    // read freshest doc state so rapid presses don't act on a stale step
    next() {
      if (!canDrive) return;
      const cur = read();
      const r = stepForward(cur.step, cur.total);
      if (r.advanceSlide) setIndexTo(cur.index + 1);
      else map.set("step", r.step);
    },
    prev() {
      if (!canDrive) return;
      const cur = read();
      const r = stepBack(cur.step);
      if (r.retreatSlide) setIndexTo(cur.index - 1);
      else map.set("step", r.step);
    },
  };
}
