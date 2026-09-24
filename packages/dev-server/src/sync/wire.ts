// Framing on the sync service's WebSocket. Binary frames carry one type byte and a
// payload; text frames carry JSON notices from the server.

export { CLOSE, isFatalClose, reconnectsAtOnce } from "@liebstoeckel/live-server/placement/protocol";

/** The protocol version this client speaks, sent as `v` on every call. The
 *  server accepts a range and refuses an older client with a message (close
 *  code `PROTOCOL_TOO_OLD` on the socket, 426 over HTTP). A missing `v` means
 *  1, the protocol before versioning. Bump it on a breaking change. */
export const SYNC_PROTOCOL = 1;

/** `url` with this client's protocol version. */
export function withProtocol(url: string): string {
  const u = new URL(url);
  u.searchParams.set("v", String(SYNC_PROTOCOL));
  return u.toString();
}

export const MSG_UPDATE = 0;
export const MSG_AWARENESS = 1;
/** Server to client, empty payload: the initial state has been sent. Clients
 *  must not create content before this, or they would race the server's
 *  files with their own. */
export const MSG_READY = 2;

export type FrameType = typeof MSG_UPDATE | typeof MSG_AWARENESS | typeof MSG_READY;

export function encodeFrame(type: FrameType, payload: Uint8Array = new Uint8Array(0)): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(payload.length + 1);
  out[0] = type;
  out.set(payload, 1);
  return out;
}

export function decodeFrame(data: Uint8Array): { type: number; payload: Uint8Array } | null {
  if (data.length === 0) return null;
  return { type: data[0]!, payload: data.subarray(1) };
}

/** JSON notices the server may send as text frames. */
export type ServerNotice =
  | { type: "error"; message: string }
  | { type: "hello"; role: "edit" | "read"; user: { name: string; email: string } };
