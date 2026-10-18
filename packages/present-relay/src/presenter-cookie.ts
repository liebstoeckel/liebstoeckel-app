// Keeps the presenter's token out of the address bar.
//
// A presenter link carries its grant in `?t=`. Left there, the token shows in the
// address bar of the presenter tab, so anyone who sees a projected screen or a screen
// share can read it and take over the talk. On the first page load the relay swaps
// the URL token for a cookie and redirects to the same page without `t`; reloads then
// find the token in the cookie. The cookie is HttpOnly (the deck runs in an opaque
// sandbox and could not read it anyway), lives as long as the browser session, and is
// scoped to the session's page path, so it reaches nothing else. The token itself is
// unchanged and verified exactly as a `?t=` one, expiry included.

/** Name of the cookie that holds the presenter token of session `id`. The id is in the
 *  name as well as the path, so two sessions never share or overwrite a cookie. Callers
 *  pass the id of a session they found, never raw request input. */
export function presenterCookie(id: string): string {
  return `lst_presenter_${id}`;
}

/** The value of cookie `name` in a `Cookie` header, or null. */
export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const value = part.slice(eq + 1).trim();
    return value || null;
  }
  return null;
}

/** The token a page request presents: `?t=` when the URL has one (an explicit link
 *  always wins, so the presenter can open the audience link in the same browser),
 *  else the presenter cookie. `fromCookie` says which. */
export function pageToken(
  url: URL,
  cookieHeader: string | null | undefined,
  id: string,
): { token: string | null; fromCookie: boolean } {
  const t = url.searchParams.get("t");
  if (t) return { token: t, fromCookie: false };
  const c = readCookie(cookieHeader, presenterCookie(id));
  return { token: c, fromCookie: !!c };
}

// Decks built before the cookie move cannot follow it.
//
// An engine older than 0.4 builds its "drive from your phone" link from the address bar.
// After the 303 the address has no `t`, so that link would carry no grant and the phone
// would be refused. Such a deck keeps its `?t=` in the address, as it did on older relays;
// rebuilding it with a current engine brings the cookie move back. The engine a deck
// bundles is in its `<meta name="generator">` stamp (written by every build since mid
// 2026). A deck without one is older still. The stamp is the author's own text, so a
// deck that strips or edits it only gives up the protection of its own presenter tab.

/** The first engine whose deck builds its phone link from the bootstrap, not the address. */
export const PRESENTER_COOKIE_ENGINE: [number, number, number] = [0, 4, 0];

/** The engine version a built deck names in its generator stamp, or null without one.
 *  Only the document head is read, the first such meta wins. */
export function stampedEngine(html: string): [number, number, number] | null {
  const end = html.search(/<\/head\s*>/i);
  const head = end >= 0 ? html.slice(0, end) : html.slice(0, 64 * 1024);
  const meta = /<meta\s+name=["']generator["']\s+content=["']liebstoeckel engine v?(\d+)\.(\d+)\.(\d+)/i.exec(head);
  return meta ? [Number(meta[1]), Number(meta[2]), Number(meta[3])] : null;
}

/** Whether a deck's presenter link may be answered with the cookie exchange: its engine
 *  is at least {@link PRESENTER_COOKIE_ENGINE}. Decided once, when the deck arrives. */
export function followsPresenterCookie(html: string): boolean {
  const v = stampedEngine(html);
  if (!v) return false;
  for (let i = 0; i < 3; i++) {
    if (v[i]! !== PRESENTER_COOKIE_ENGINE[i]!) return v[i]! > PRESENTER_COOKIE_ENGINE[i]!;
  }
  return true;
}

/** The deck page differs by cookie and may hold a grant, so no cache keeps it. */
export const NO_STORE = "no-store, private";

/** A token only ever travels in a `?t=` value or a cookie value, so anything outside the
 *  URL-safe base64 alphabet plus `.` is refused rather than written into a header. */
const SAFE = /^[A-Za-z0-9_.-]{1,2048}$/;

/** The `303` that moves a presenter token from the URL into a cookie: `Location` is the
 *  same page without `t` (other query params stay; the browser keeps the `#fragment`),
 *  `Set-Cookie` holds the token, scoped to the page's path. `secure` is whether the
 *  browser reached us over https (behind a proxy the request URL may say http). */
export function presenterRedirect(url: URL, id: string, token: string, secure: boolean): Response {
  if (!SAFE.test(token)) return new Response("Invalid or expired link.", { status: 403 });
  const to = new URL(url.href);
  to.searchParams.delete("t");
  const location = to.pathname + to.search;
  const attrs = [
    `${presenterCookie(id)}=${token}`,
    `Path=${url.pathname}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ];
  return new Response(null, {
    status: 303,
    headers: {
      location,
      "set-cookie": attrs.join("; "),
      "cache-control": NO_STORE,
      "referrer-policy": "no-referrer",
    },
  });
}

/** The page's `403` when no valid token came with the request. A request without `t`
 *  is a presenter reload whose cookie is gone (expired, cleared, or blocked), so say
 *  how to get back in. */
export function deniedPage(hadUrlToken: boolean): Response {
  const text = hadUrlToken
    ? "Invalid or expired link."
    : "This presenter page needs its link again. Open the presenter link where you started the talk, or scan the presenter QR code again.";
  return new Response(text, { status: 403, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": NO_STORE } });
}

// Each audience browser keeps its own participant id in a cookie as well.
//
// Poll votes and Q&A upvotes are keyed by the participant id. The deck cannot keep
// the id in storage (opaque sandbox), and kept in the tab's address instead, a copied
// link (pasted into a meeting chat) would let a second person vote as the first, while
// a second scan of the join code would vote again. So the relay keeps the id in a
// cookie and hands it to the page in the bootstrap: a reload or a re-scan on the same
// device brings the cookie back and keeps the id, a copied address opened on another
// device has no cookie and gets a fresh id. The id is random and not secret (votes are
// keyed by it in the shared doc anyway), so this cookie never stands for a role: the
// page's token still comes from `?t=` or the presenter cookie alone.

/** Name of the cookie that holds this browser's participant id in session `id`.
 *  Callers pass the id of a session they found, never raw request input. */
export function viewerCookie(id: string): string {
  return `lst_viewer_${id}`;
}

/** The ids the engine accepts as a participant id (its own check); anything else in
 *  the cookie is replaced by a fresh id rather than echoed into the page. */
const PARTICIPANT = /^[A-Za-z0-9_-]{8,64}$/;

/** The participant id of the browser behind a viewer page request, and the
 *  `Set-Cookie` that keeps it: the id in its cookie for this session, or a fresh one.
 *  The cookie is set again on every load, so its lifetime follows the latest grant.
 *  `path` is the page's path (the cookie reaches nothing else), `secure` whether the
 *  browser reached us over https, `endsAt` when the session ends (unix ms): the cookie
 *  goes with it. */
export function viewerIdentity(
  cookieHeader: string | null | undefined,
  id: string,
  path: string,
  secure: boolean,
  endsAt: number,
  now = Date.now(),
): { participant: string; setCookie: string } {
  const kept = readCookie(cookieHeader, viewerCookie(id));
  const participant = kept && PARTICIPANT.test(kept) ? kept : crypto.randomUUID();
  const attrs = [
    `${viewerCookie(id)}=${participant}`,
    `Path=${path}`,
    `Max-Age=${Math.max(0, Math.ceil((endsAt - now) / 1000))}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ];
  return { participant, setCookie: attrs.join("; ") };
}
