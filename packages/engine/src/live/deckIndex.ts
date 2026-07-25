import * as Y from "yjs";
import { useEffect, useState } from "react";
import {
  stepForward,
  stepBack,
  stepOnEnter,
  resolveStep,
  totalIsFresh,
  STEP_ALL,
  type StepPos,
  type SlideEntry,
} from "../delivery";

const clampN = (n: number, count: number) => Math.min(Math.max(n, 0), Math.max(count - 1, 0));

export const getDeckIndex = (doc: Y.Doc): number => (doc.getMap("deck").get("index") as number) ?? 0;
export const setDeckIndex = (doc: Y.Doc, n: number): void => {
  doc.getMap("deck").set("index", n);
};

export interface DeckController {
  index: number;
  /** May be STEP_ALL; resolve with resolveStep against a fresh `total`. */
  step: StepPos;
  total: number;
  /** The slide index `total` describes; see totalIsFresh. */
  totalFor: number;
  /** The terminal end-of-deck screen, shared so the presenter can put the
   *  audience into it. Any slide change clears it. */
  ended: boolean;
  canDrive: boolean;
  setIndex(u: number | ((n: number) => number)): void;
  setStep(step: StepPos): void;
  setTotal(total: number, forIndex: number): void;
  setEnded(ended: boolean): void;
  next(): void;
  prev(): void;
}

/** Deck nav state backed by the shared doc: viewers follow, only `canDrive` (the
 *  presenter role) writes. Carries index + step + total so reveals follow too. */
export function useLiveDeck(doc: Y.Doc, count: number, canDrive: boolean): DeckController {
  // `step` carries the STEP_ALL sentinel as a string and `ended` is a flag, so the
  // map is not number-only.
  const map = doc.getMap<number | string | boolean>("deck");
  const read = () => ({
    index: (map.get("index") as number) ?? 0,
    step: (map.get("step") as StepPos) ?? 0,
    total: (map.get("total") as number) ?? 0,
    totalFor: (map.get("totalFor") as number) ?? 0,
    ended: (map.get("ended") as boolean) ?? false,
  });
  const [s, setS] = useState(read);
  useEffect(() => {
    const handler = () => setS(read());
    map.observe(handler);
    handler();
    return () => map.unobserve(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  // Every slide change names how it was entered, so the reveal state it lands on
  // comes from the one shared policy instead of each call site deciding.
  const setIndexTo = (n: number, entry: SlideEntry) =>
    doc.transact(() => {
      map.set("index", clampN(n, count));
      map.set("step", stepOnEnter(entry));
      // Moving to a slide always leaves the end screen, in the same transaction so
      // no viewer observes a slide change that is still flagged as ended.
      map.set("ended", false);
    });

  // Guards PREV only. STEP_ALL resolves to exactly `total`, so going forward from a
  // fully revealed slide advances whatever the number is; only stepBack needs the
  // real count. Guarding next() too would dead-end forward navigation permanently in
  // a session where nothing mounts a StepsProvider to report totals.
  const stale = (cur: ReturnType<typeof read>) =>
    cur.step === STEP_ALL && !totalIsFresh(cur.totalFor, cur.index);

  return {
    ...s,
    canDrive,
    setIndex(u) {
      if (!canDrive) return;
      setIndexTo(typeof u === "function" ? u(read().index) : u, "jump");
    },
    setStep(step) {
      if (canDrive) map.set("step", step);
    },
    setEnded(ended) {
      if (canDrive) map.set("ended", ended);
    },
    setTotal(total, forIndex) {
      if (!canDrive) return;
      const cur = read();
      if (cur.total === total && cur.totalFor === forIndex) return;
      doc.transact(() => {
        map.set("total", total);
        map.set("totalFor", forIndex);
      });
    },
    // read freshest doc state so rapid presses don't act on a stale step
    next() {
      if (!canDrive) return;
      const cur = read();
      const r = stepForward(resolveStep(cur.step, cur.total), cur.total);
      if (r.advanceSlide) setIndexTo(cur.index + 1, "forward");
      else map.set("step", r.step);
    },
    prev() {
      if (!canDrive) return;
      const cur = read();
      if (stale(cur)) return;
      const r = stepBack(resolveStep(cur.step, cur.total));
      if (r.retreatSlide) setIndexTo(cur.index - 1, "backward");
      else map.set("step", r.step);
    },
  };
}
