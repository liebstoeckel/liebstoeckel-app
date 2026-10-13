const KEY = "liebstoeckel:pid";

/** Query parameter that carries the participant id in the page URL. */
const PARAM = "pid";

type Store = Pick<Storage, "getItem" | "setItem">;

/** Where the id can live in the URL: read the current href, replace it in place. */
export interface UrlSlot {
  read(): string;
  write(href: string): void;
}

// Ids we mint are UUIDs or `p-<base36>`; anything else in the URL is ignored, so a
// hand-edited or malicious link can't smuggle arbitrary text into plugin state keys.
const VALID = /^[A-Za-z0-9_-]{8,64}$/;

// crypto.randomUUID only exists in secure contexts (https/localhost). Live decks
// are served over http on a LAN IP, so fall back to a non-crypto random id.
function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `p-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** The participant id carried in `href`, or null when absent or malformed. */
function participantFromUrl(href: string): string | null {
  let id: string | null;
  try {
    id = new URL(href).searchParams.get(PARAM);
  } catch {
    return null;
  }
  return id && VALID.test(id) ? id : null;
}

/** `href` with the participant id set; path, other query params and the hash
 *  (e.g. `#presenter`) are kept as they are. */
function withParticipant(href: string, id: string): string {
  const url = new URL(href);
  url.searchParams.set(PARAM, id);
  return url.href;
}

/** A query string (`?t=...&pid=...`) without the participant id. For links this
 *  tab hands to someone else (the presenter pop-out, the share QR): the id names
 *  this tab's participant, and a second tab carrying it would vote as the same
 *  person. */
export function withoutParticipant(search: string): string {
  const params = new URLSearchParams(search);
  if (!params.has(PARAM)) return search;
  params.delete(PARAM);
  const rest = params.toString();
  return rest ? `?${rest}` : "";
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

/** The page's own URL, replaced without navigating. Undefined outside a browser
 *  or on a non-http(s) document (a `data:`/`about:` capture page), where rewriting
 *  the URL is either impossible or pointless. */
function pageUrl(): UrlSlot | undefined {
  if (typeof location === "undefined" || typeof history === "undefined") return undefined;
  if (location.protocol !== "http:" && location.protocol !== "https:") return undefined;
  return {
    read: () => location.href,
    write: (href) => history.replaceState(history.state, "", href),
  };
}

/** Run `fn`, or return `fallback` if it throws; storage and history both can. */
function attempt<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** `href` without the participant id, or null when it carries none. */
function withoutParticipantInHref(href: string): string | null {
  const url = new URL(href);
  if (!url.searchParams.has(PARAM)) return null;
  url.search = withoutParticipant(url.search);
  return url.href;
}

/** Stable id for this participant, so a reload keeps identity and doesn't count a
 *  vote twice. Resolution order:
 *
 *  1. the id the server issued with the page (`issued`), used verbatim;
 *  2. an id in the page URL (`?pid=`), used verbatim;
 *  3. sessionStorage;
 *  4. a freshly minted id.
 *
 *  A hosting relay issues the id from a cookie of its own, so it stays with the
 *  browser: a reload or a second scan of the join code on the same device keeps it,
 *  while a copied address opened elsewhere gets a new one. The URL then carries no
 *  id, and one left there by an older link is removed, so a copy can't pass it on.
 *
 *  Without an issued id (a LAN server, the dev server, an older relay), one tab is
 *  one participant: when storage can't hold the id (an opaque-origin sandbox denies
 *  it), the id is written into this tab's URL instead, in place and without a
 *  reload, so the next reload finds it at step 2. Links handed to an audience never
 *  carry an id: each viewer's tab gets its own on first load. */
export function getParticipantId(storage?: Store, url?: UrlSlot, issued?: string): string {
  const slot = url ?? pageUrl();
  if (issued && VALID.test(issued)) {
    if (slot) {
      const clean = attempt(() => withoutParticipantInHref(slot.read()), null);
      if (clean) attempt(() => slot.write(clean), undefined);
    }
    return issued;
  }

  const store = storage ?? safeSessionStorage();
  const href = slot ? attempt(() => slot.read(), "") : "";

  const fromUrl = href ? participantFromUrl(href) : null;
  if (fromUrl) return fromUrl;

  const stored = store ? attempt(() => store.getItem(KEY), null) : null;
  if (stored) return stored;

  const id = uuid();
  const kept = store ? attempt(() => (store.setItem(KEY, id), true), false) : false;
  if (!kept && slot && href) attempt(() => slot.write(withParticipant(href, id)), undefined);
  return id;
}
