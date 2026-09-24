// The live socket's contract as the browser sees it: the protocol version it sends
// and the close codes servers use. The servers' side lives in the live server's
// placement protocol; the engine cannot import it (the live server depends on the
// engine), so a live-server test keeps the two equal.

/** The live protocol this client speaks, sent as `v` on the socket URL. */
export const LIVE_PROTOCOL = 1;

/** WebSocket close codes shared by the live servers. */
export const LIVE_CLOSE = {
  /** The grant expired; reconnect with a fresh one. */
  GRANT_EXPIRED: 4001,
  /** The server is restarting; reconnect at once. */
  RESTARTING: 4003,
  /** The session moved to another server; reconnect at once. */
  MOVED: 4004,
  /** This client speaks a protocol the server no longer supports. */
  PROTOCOL_TOO_OLD: 4005,
  /** The talk ended; do not reconnect. */
  ENDED: 4006,
} as const;

/** Where a live connection stands, for status displays. */
export type LiveStatus =
  /** first connect, not yet open */
  | "connecting"
  | "connected"
  /** lost, trying again (at once after a restart or move, with backoff otherwise) */
  | "reconnecting"
  /** the talk ended; the connection stays closed */
  | "ended"
  /** the server refused this client's protocol; a reload fetches a current one */
  | "outdated";

export interface LiveState {
  status: LiveStatus;
  /** the server's explanation, for `outdated` */
  message?: string;
}

/** `url` with this client's protocol version. */
export function withLiveProtocol(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}v=${LIVE_PROTOCOL}`;
}
