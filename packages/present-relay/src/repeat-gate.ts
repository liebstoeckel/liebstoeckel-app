// The relay renews its liveness lease every few seconds. When the cluster refuses the
// Lease API (no RBAC for it), every renewal fails the same way, and logging each one
// would fill the log with one line every 5 s for as long as the pod runs.

/** A gate for a message that repeats: the first time a message is seen it passes, the
 *  same message again only after `everyMs` (with how many were held back meanwhile), and
 *  a different message passes at once. */
export function repeatGate(everyMs: number, now: () => number = Date.now): (message: string) => { log: boolean; held: number } {
  let last: string | null = null;
  let lastAt = 0;
  let held = 0;
  return (message) => {
    const t = now();
    if (message !== last || t - lastAt >= everyMs) {
      const out = { log: true, held: message === last ? held : 0 };
      last = message;
      lastAt = t;
      held = 0;
      return out;
    }
    held++;
    return { log: false, held };
  };
}
