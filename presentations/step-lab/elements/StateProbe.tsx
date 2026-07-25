import { useEffect, useState } from "react";

// A deliberately stateful element for the persistent layer. The engine renders it
// ONCE and moves it between <Slot>s, so both numbers below must keep climbing as
// you move around the deck. If either resets to zero, the element was remounted
// and its state was lost, which is the thing this deck exists to make visible.
//
// `ticks` proves the element kept living (it never stops). `clicks` proves it kept
// its own interaction state; click it a few times before navigating.
export function StateProbe() {
  const [ticks, setTicks] = useState(0);
  const [clicks, setClicks] = useState(0);
  const [bornAt] = useState(() => new Date().toLocaleTimeString());

  useEffect(() => {
    const id = setInterval(() => setTicks((n) => n + 1), 100);
    return () => clearInterval(id);
  }, []);

  return (
    <button
      onClick={() => setClicks((n) => n + 1)}
      className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-surface/40 font-mono shadow-2xl transition-colors hover:border-primary"
    >
      <span className="text-4xl font-bold text-primary">{(ticks / 10).toFixed(1)}s</span>
      <span className="text-lg text-text">{clicks} clicks</span>
      <span className="text-[0.7rem] uppercase tracking-[0.2em] text-muted">born {bornAt}</span>
    </button>
  );
}
