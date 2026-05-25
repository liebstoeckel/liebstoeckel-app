import { useCallback, useEffect, useRef, useState } from "react";
import { stepForward, stepBack } from "./delivery";

// Cross-window sync over BroadcastChannel. The audience window and the presenter
// window share { index, step, total, startedAt }; either can drive. On open, a new
// window broadcasts a "request" and the others reply so it snaps to the live state.
export type DeckState = { index: number; step: number; total: number; startedAt: number };
type Msg = ({ type: "state" } & DeckState) | { type: "request" };

const CHANNEL = "present-it";

export function useDeckSync(count: number) {
  const [state, setState] = useState<DeckState>(() => ({ index: 0, step: 0, total: 0, startedAt: Date.now() }));
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
          s.index === m.index && s.step === m.step && s.total === m.total && s.startedAt === m.startedAt
            ? s
            : { index: m.index, step: m.step, total: m.total, startedAt: m.startedAt },
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

  const setIndex = useCallback(
    (updater: number | ((n: number) => number)) =>
      commit({ index: clamp(typeof updater === "function" ? updater(ref.current.index) : updater) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commit, count],
  );
  const setStep = useCallback((step: number) => commit({ step }), [commit]);
  const setTotal = useCallback((total: number) => {
    if (ref.current.total !== total) commit({ total });
  }, [commit]);
  const resetTimer = useCallback(() => commit({ startedAt: Date.now() }), [commit]);

  // next/prev read the freshest state (ref) so rapid presses don't read stale step
  const next = useCallback(() => {
    const s = ref.current;
    const r = stepForward(s.step, s.total);
    commit(r.advanceSlide ? { index: clamp(s.index + 1), step: 0 } : { step: r.step });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit, count]);
  const prev = useCallback(() => {
    const s = ref.current;
    const r = stepBack(s.step);
    commit(r.retreatSlide ? { index: clamp(s.index - 1), step: 0 } : { step: r.step });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit, count]);

  return {
    index: state.index,
    step: state.step,
    total: state.total,
    startedAt: state.startedAt,
    canDrive: true,
    setIndex,
    setStep,
    setTotal,
    resetTimer,
    next,
    prev,
  };
}
