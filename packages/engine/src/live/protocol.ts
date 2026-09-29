// The live socket's contract as the browser sees it: the protocol version it sends
// and the close codes servers use. The servers' side lives in the live server's
// placement protocol; the engine cannot import it (the live server depends on the
// engine), so a live-server test keeps the two equal.

/** The live protocol this client speaks, sent as `v` on the socket URL. */
export const LIVE_PROTOCOL = 2;

/** Why a server refused an audience write (see the live server's protocol). */
export type RefusalReason = "busy" | "full" | "invalid";

/** Control messages servers send as text frames to protocol 2 clients. After `reset`
 *  the next binary frame is the whole session state, which replaces the client's doc. */
export type LiveNotice =
  | { t: "refused"; reason: RefusalReason; roots: string[] }
  | { t: "reset" }
  | { t: "refusing"; reason: Exclude<RefusalReason, "invalid"> | null };

const REASONS: readonly string[] = ["busy", "full", "invalid"];

/** Read a text frame as a notice; anything else (a newer server's message, garbage) is
 *  ignored. */
export function parseNotice(text: string): LiveNotice | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const m = v as Record<string, unknown>;
  if (m.t === "refused" && typeof m.reason === "string" && REASONS.includes(m.reason)) {
    const roots = Array.isArray(m.roots) ? m.roots.filter((r): r is string => typeof r === "string").slice(0, 8) : [];
    return { t: "refused", reason: m.reason as RefusalReason, roots };
  }
  if (m.t === "reset") return { t: "reset" };
  if (m.t === "refusing" && (m.reason === null || m.reason === "busy" || m.reason === "full")) {
    return { t: "refusing", reason: m.reason };
  }
  return null;
}

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
  /** One of this client's updates was dropped (the audience rate limit); reconnect
   *  and send the full state again so the later ones arrive. */
  DROPPED: 4007,
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
  /** the server keeps refusing this client's updates for coming too fast; it is
   *  resending them, a little slower */
  sending?: boolean;
  /** presenters: the server is refusing audience input right now, because a field is
   *  full or because it is short of memory (`busy`) */
  refusing?: "busy" | "full";
}

/** `url` with this client's protocol version. */
export function withLiveProtocol(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}v=${LIVE_PROTOCOL}`;
}
