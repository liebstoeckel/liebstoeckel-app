import { withoutParticipant } from "./participant";

/** A link to this page for another window or device: origin, path and query of `href`,
 *  minus this tab's participant id (the other window is a participant of its own), and
 *  with `t` set to `token` when one is given.
 *
 *  A live presenter's address bar no longer holds its grant (the server moves it into a
 *  cookie on the first load), so a link that has to sign in as the presenter, the `P`
 *  pop-out or the phone handoff, is built from the token the page was started with,
 *  not from the URL. */
export function linkWithToken(href: string, token?: string): string {
  const u = new URL(href);
  u.hash = "";
  const search = withoutParticipant(u.search);
  if (token) {
    const params = new URLSearchParams(search);
    params.set("t", token);
    u.search = `?${params}`;
  } else u.search = search;
  return u.href;
}
