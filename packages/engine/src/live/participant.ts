const KEY = "liebstoeckel:pid";

type Store = Pick<Storage, "getItem" | "setItem">;

// crypto.randomUUID only exists in secure contexts (https/localhost). Live decks
// are served over http on a LAN IP, so fall back to a non-crypto random id.
function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `p-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** sessionStorage, or undefined if it isn't usable. Merely *accessing* the
 *  property throws ("Access is denied") in an opaque origin, a sandboxed deck
 *  (relay's `CSP: sandbox`) or a `setContent`/`data:` document (thumbnail capture)
 * , so the access itself must be guarded, not just a typeof check. */
function safeSessionStorage(): Store | undefined {
  try {
    const s = sessionStorage;
    return s ?? undefined;
  } catch {
    return undefined;
  }
}

/** Stable id for this browser session (one session = one participant). Persists
 *  in sessionStorage so a reload keeps identity (no double-counting votes). When
 *  storage is denied (opaque origin), falls back to an ephemeral per-load id, *  navigation still works; identity just doesn't survive a reload there. */
export function getParticipantId(storage?: Store): string {
  const store = storage ?? safeSessionStorage();
  if (!store) return uuid();
  try {
    let id = store.getItem(KEY);
    if (!id) {
      id = uuid();
      store.setItem(KEY, id);
    }
    return id;
  } catch {
    return uuid();
  }
}
