import { useState } from "react";

/** A component with state of its own: hot reload has to keep the count. */
export function Counter() {
  const [n, setN] = useState(0);
  return (
    <button id="fx-counter" onClick={() => setN(n + 1)} className="mt-8 rounded-lg border border-border px-4 py-2 font-mono text-lg text-muted">
      clicked {n} COUNTERMARK
    </button>
  );
}
