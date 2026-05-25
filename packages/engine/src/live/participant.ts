const KEY = "present-it:pid";

type Store = Pick<Storage, "getItem" | "setItem">;

// crypto.randomUUID only exists in secure contexts (https/localhost). Live decks
// are served over http on a LAN IP, so fall back to a non-crypto random id.
function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `p-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** Stable id for this browser session (one session = one participant). Persists
 *  in sessionStorage so a reload keeps identity (no double-counting votes). */
export function getParticipantId(storage?: Store): string {
  const store = storage ?? (typeof sessionStorage !== "undefined" ? sessionStorage : undefined);
  if (!store) return uuid();
  let id = store.getItem(KEY);
  if (!id) {
    id = uuid();
    store.setItem(KEY, id);
  }
  return id;
}
