// The contract between stateful services (the relay, live source sync) and their
// clients: close codes and the protocol version handshake. Browser-safe.

/** WebSocket close codes shared by every stateful service. */
export const CLOSE = {
  /** The grant expired; reconnect with a fresh one. */
  GRANT_EXPIRED: 4001,
  /** The server is restarting; reconnect at once. */
  RESTARTING: 4003,
  /** The object moved to another server; reconnect at once. */
  MOVED: 4004,
  /** The client speaks a protocol version the server no longer supports. */
  PROTOCOL_TOO_OLD: 4005,
  /** The object is gone for good (a live talk that ended); do not reconnect. */
  ENDED: 4006,
  /** The server dropped one of this client's updates (the audience rate limit), so
   *  its later updates could not apply; reconnect and send the full state again. */
  DROPPED: 4007,
} as const;

/** Close codes after which a client should reconnect immediately, without
 *  growing its backoff. */
export function reconnectsAtOnce(code: number): boolean {
  return code === CLOSE.RESTARTING || code === CLOSE.MOVED || code === CLOSE.GRANT_EXPIRED;
}

/** Close codes after which reconnecting cannot help. */
export function isFatalClose(code: number): boolean {
  return code === CLOSE.PROTOCOL_TOO_OLD || code === CLOSE.ENDED;
}

/** The live-talk protocol (decks in the browser, the relay's create API) the
 *  servers speak: the browser sends `v`, the control plane `x-live-protocol`. */
export const LIVE_PROTOCOL: SupportedVersions = { min: 1, max: 2 };

/** The first protocol version whose clients take {@link LiveNotice}s. Older clients
 *  never get one, so what they receive stays exactly what it was. */
export const NOTICES_SINCE = 2;

/** Why the relay refused an audience write, as a client hears it. `busy`: the relay is
 *  short of memory and takes no audience writes for now; `full`: the field the write
 *  adds to is at its entry cap; `invalid`: the write was outside what the audience may
 *  write, or out of bounds. */
export type RefusalReason = "busy" | "full" | "invalid";

/** Control messages a server sends as WebSocket text frames (JSON), protocol 2 and up.
 *  - `refused`, to the viewer whose write was refused. `roots` names the doc roots the
 *    write touched (e.g. `plugin:poll`), for the viewer's message.
 *  - `reset`, to that viewer, soon after: the next binary frame on the same socket is
 *    the whole session state, which replaces the client's doc, so the viewer's screen
 *    shows what the presenter has (the refused write, and anything built on it, gone).
 *  - `refusing`, to presenters: audience writes are being refused (`busy` or `full`),
 *    or, with `reason: null`, are taken again. */
export type LiveNotice =
  | { t: "refused"; reason: RefusalReason; roots: string[] }
  | { t: "reset" }
  | { t: "refusing"; reason: Exclude<RefusalReason, "invalid"> | null };

/** A close reason must fit 123 bytes; the full message goes where there is room. */
export const TOO_OLD_REASON = "This page is out of date. Reload it to reconnect.";

export interface SupportedVersions {
  /** Oldest version still accepted. */
  min: number;
  /** Newest version this server speaks. */
  max: number;
}

export type Negotiated =
  | { ok: true; version: number }
  | { ok: false; code: typeof CLOSE.PROTOCOL_TOO_OLD; status: 426; message: string };

/** Check a client's `v` parameter. A missing version means version 1, the
 *  protocol before versioning existed, so old clients get a clear answer. */
export function negotiateVersion(requested: string | null | undefined, supported: SupportedVersions): Negotiated {
  const v = requested == null || requested === "" ? 1 : Number(requested);
  if (!Number.isInteger(v) || v < supported.min) {
    return {
      ok: false,
      code: CLOSE.PROTOCOL_TOO_OLD,
      status: 426,
      message: `This client is too old for the server (protocol ${requested ?? "1"}, the server needs ${supported.min} or newer). Update the CLI or reload the page.`,
    };
  }
  // A newer client talks to an older server in the server's newest version.
  return { ok: true, version: Math.min(v, supported.max) };
}
