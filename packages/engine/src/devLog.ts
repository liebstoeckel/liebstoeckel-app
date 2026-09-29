// The engine's authoring warnings, reported twice in development: to the
// browser console as always, and into a small page-global record that the
// `liebstoeckel dev` bridge forwards to the dev terminal and to `dev poll`.
// The record exists because the bridge script loads asynchronously (after the
// dev server answers a ping), so a warning from the first render can happen
// before anything is listening; the bridge reads what was recorded when it
// starts and listens for the rest. A deck build pins `process.env.NODE_ENV`
// to "production", which drops the record (the global and the event name
// included) from built decks; the console line stays.

export interface DevLogEntry {
  level: "warn" | "error";
  message: string;
}

/** Entries kept for a bridge that has not started yet; the oldest go first. */
const MAX_RECORDED = 50;

function record(entry: DevLogEntry): void {
  if (process.env.NODE_ENV !== "production") {
    if (typeof window === "undefined") return;
    const host = window as unknown as { __LIEBSTOECKEL_DEV_LOG__?: DevLogEntry[] };
    const log = (host.__LIEBSTOECKEL_DEV_LOG__ ??= []);
    log.push(entry);
    if (log.length > MAX_RECORDED) log.splice(0, log.length - MAX_RECORDED);
    try {
      window.dispatchEvent(new CustomEvent("liebstoeckel:dev-log", { detail: entry }));
    } catch {
      // no CustomEvent in this environment: the record alone still works
    }
  }
}

/** console.warn for an authoring mistake the author (or their agent) should
 *  hear about in the dev terminal too. Start the message with `[liebstoeckel]`. */
export function devWarn(message: string): void {
  console.warn(message);
  record({ level: "warn", message });
}
