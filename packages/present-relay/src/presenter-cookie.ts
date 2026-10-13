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
