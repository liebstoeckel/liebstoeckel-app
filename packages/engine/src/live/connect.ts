import * as Y from "yjs";
import type { LiveInfo } from "./detect";

export interface LiveConnection {
  doc: Y.Doc;
  onStatus(cb: (connected: boolean) => void): void;
  close(): void;
}

export interface ConnectOptions {
  WS?: typeof WebSocket;
  /** base reconnect delay (ms); backs off exponentially, capped */
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
}

/** Connect a Yjs doc to the live server over WebSocket, with auto-reconnect.
 *  On (re)open it pushes local state up and the server replies with the full
 *  session state; thereafter updates flow both ways. Survives network blips. */
export function connectLive(info: LiveInfo, participant: string, opts: ConnectOptions = {}): LiveConnection {
  const WS = opts.WS ?? WebSocket;
  const baseMs = opts.reconnectBaseMs ?? 1000;
  const maxMs = opts.reconnectMaxMs ?? 15000;
  const doc = new Y.Doc();
  const sep = info.ws.includes("?") ? "&" : "?";
  const url = `${info.ws}${sep}p=${encodeURIComponent(participant)}`;
  const statusCbs: Array<(c: boolean) => void> = [];
  const emit = (c: boolean) => statusCbs.forEach((cb) => cb(c));

  let ws: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin !== "remote" && ws && ws.readyState === ws.OPEN) ws.send(new Uint8Array(update));
  };
  doc.on("update", onUpdate);

  const schedule = () => {
    if (closed) return;
    const delay = Math.min(baseMs * 2 ** attempt, maxMs);
    attempt++;
    timer = setTimeout(open, delay);
  };

  function open() {
    if (closed) return;
    const sock = new WS(url);
    ws = sock;
    sock.binaryType = "arraybuffer";
    sock.addEventListener("open", () => {
      attempt = 0;
      try {
        sock.send(new Uint8Array(Y.encodeStateAsUpdate(doc)));
      } catch {
        /* ignore */
      }
      emit(true);
    });
    sock.addEventListener("message", (e: MessageEvent) => {
      try {
        Y.applyUpdate(doc, new Uint8Array(e.data as ArrayBuffer), "remote");
      } catch {
        /* ignore malformed frame */
      }
    });
    sock.addEventListener("close", () => {
      emit(false);
      schedule();
    });
    sock.addEventListener("error", () => {
      try {
        sock.close();
      } catch {
        /* the close handler will reconnect */
      }
    });
  }

  open();

  return {
    doc,
    onStatus(cb) {
      statusCbs.push(cb);
    },
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      doc.off("update", onUpdate);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      doc.destroy();
    },
  };
}
