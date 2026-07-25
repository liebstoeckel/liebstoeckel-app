import { useCallback, useEffect, useRef, useState } from "react";
import {
  stepForward,
  stepBack,
  stepOnEnter,
  resolveStep,
  totalIsFresh,
  STEP_ALL,
  type StepPos,
} from "./delivery";

// Cross-window sync over BroadcastChannel. The audience window and the presenter
// window share { index, step, total, totalFor, startedAt }; either can drive. On
// open, a new window broadcasts a "request" and the others reply so it snaps to
// the live state. `step` may be the STEP_ALL sentinel: it is resolved by whoever
// reads it, never written back.
export type DeckState = {
  index: number;
  step: StepPos;
  total: number;
  /** The slide index `total` describes; see totalIsFresh. */
  totalFor: number;
  /** The terminal end-of-deck screen. Shared rather than window-local so the
   *  presenter can put the audience into it, which is the whole point of the end
   *  screen: the driver decides the deck is over. Any slide change clears it. */
  ended: boolean;
  startedAt: number;
};
type Msg = ({ type: "state" } & DeckState) | { type: "request" };

const CHANNEL = "liebstoeckel";

export function useDeckSync(count: number) {
  const [state, setState] = useState<DeckState>(() => ({
    index: 0,
    step: 0,
    total: 0,
    totalFor: 0,
    ended: false,
    startedAt: Date.now(),
  }));
  const ref = useRef(state);
  ref.current = state;
  const chan = useRef<BroadcastChannel | null>(null);
  const clamp = (n: number) => Math.min(Math.max(n, 0), Math.max(count - 1, 0));

  useEffect(() => {
    const ch = new BroadcastChannel(CHANNEL);
    chan.current = ch;
    ch.onmessage = (e: MessageEvent<Msg>) => {
      const m = e.data;
      if (m.type === "state") {
        setState((s) =>
          s.index === m.index &&
          s.step === m.step &&
          s.total === m.total &&
          s.totalFor === m.totalFor &&
          s.ended === m.ended &&
          s.startedAt === m.startedAt
            ? s
            : {
                index: m.index,
                step: m.step,
                total: m.total,
                totalFor: m.totalFor,
                ended: m.ended,
                startedAt: m.startedAt,
              },
        );
      } else if (m.type === "request") {
        ch.postMessage({ type: "state", ...ref.current });
      }
    };
    ch.postMessage({ type: "request" });
    return () => ch.close();
  }, []);

  const commit = useCallback((patch: Partial<DeckState>) => {
    setState((s) => {
      const ns = { ...s, ...patch };
      chan.current?.postMessage({ type: "state", ...ns });
      return ns;
    });
  }, []);

  // A jump lands unrevealed: without the explicit step the origin slide's step
  // carried over and partially revealed the target.
  const setIndex = useCallback(
    (updater: number | ((n: number) => number)) =>
      commit({
        index: clamp(typeof updater === "function" ? updater(ref.current.index) : updater),
        step: stepOnEnter("jump"),
        ended: false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commit, count],
  );
  const setStep = useCallback((step: StepPos) => commit({ step }), [commit]);
  const setTotal = useCallback(
    (total: number, forIndex: number) => {
      if (ref.current.total !== total || ref.current.totalFor !== forIndex)
        commit({ total, totalFor: forIndex });
    },
    [commit],
  );
  const setEnded = useCallback((ended: boolean) => commit({ ended }), [commit]);
  const resetTimer = useCallback(() => commit({ startedAt: Date.now() }), [commit]);

  // next/prev read the freshest state (ref) so rapid presses don't read stale step.
  // Resolving STEP_ALL needs a total that describes the slide we're on; right after
  // a slide change it still describes the one we left, so we wait for the landed
  // slide to report rather than step to a number derived from the wrong count.
  const stale = (s: DeckState) => s.step === STEP_ALL && !totalIsFresh(s.totalFor, s.index);
  const next = useCallback(() => {
    const s = ref.current;
    if (stale(s)) return;
    const r = stepForward(resolveStep(s.step, s.total), s.total);
    commit(
      r.advanceSlide ? { index: clamp(s.index + 1), step: stepOnEnter("forward"), ended: false } : { step: r.step },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit, count]);
  const prev = useCallback(() => {
    const s = ref.current;
    if (stale(s)) return;
    const r = stepBack(resolveStep(s.step, s.total));
    commit(
      r.retreatSlide ? { index: clamp(s.index - 1), step: stepOnEnter("backward"), ended: false } : { step: r.step },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit, count]);

  return {
    index: state.index,
    step: state.step,
    total: state.total,
    totalFor: state.totalFor,
    ended: state.ended,
    startedAt: state.startedAt,
    canDrive: true,
    setIndex,
    setStep,
    setTotal,
    setEnded,
    resetTimer,
    next,
    prev,
  };
}
