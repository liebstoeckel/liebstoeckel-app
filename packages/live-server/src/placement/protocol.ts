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
} as const;

/** Close codes after which a client should reconnect immediately, without
 *  growing its backoff. */
export function reconnectsAtOnce(code: number): boolean {
  return code === CLOSE.RESTARTING || code === CLOSE.MOVED || code === CLOSE.GRANT_EXPIRED;
}

/** Close codes after which reconnecting cannot help. */
export function isFatalClose(code: number): boolean {
  return code === CLOSE.PROTOCOL_TOO_OLD;
}

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
