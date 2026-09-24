import * as Y from "yjs";
import type { LiveInfo } from "./detect";
import { LIVE_CLOSE, type LiveState, withLiveProtocol } from "./protocol";

export interface LiveConnection {
  doc: Y.Doc;
  onStatus(cb: (connected: boolean) => void): void;
  /** The detailed state (reconnecting, ended, outdated), called with the current
   *  state at once and on every change. */
  onState(cb: (state: LiveState) => void): void;
  close(): void;
}

export interface ConnectOptions {
  WS?: typeof WebSocket;
  /** base reconnect delay (ms); backs off exponentially, capped */
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  /** force-reconnect if no frame (incl. server keepalives) arrives within this
   *  window, detects half-open sockets the browser won't `close`. 0 = disabled. */
  staleMs?: number;
  /** After this many consecutive failed (re)connect attempts the session is likely
   *  *gone* (re-provisioned to a new relay session) rather than a transient blip, so
   *  retrying the same URL will 403 forever ((internal ADR) §5 / (internal ticket)). Fire
   *  `onUnrecoverable` once to recover via the stable link. 0 = never (default). */
  reloadAfterAttempts?: number;
  /** Recovery action when the session looks gone. Default: reload the page (which
   *  re-resolves the stable `/live/:slug` → the new relay session) where possible. */
  onUnrecoverable?: () => void;
  /** After a planned close (restarting, moved), retry about this often (ms, plus up to
   *  as much jitter) instead of backing off, for `quickRetryWindowMs`. */
  quickRetryMs?: number;
  quickRetryWindowMs?: number;
}

/** Connect a Yjs doc to the live server over WebSocket, with auto-reconnect and a
 *  liveness watchdog. On (re)open it pushes local state up and the server replies
 *  with the full session state; thereafter updates flow both ways. Survives
 *  network blips and silently-dead (half-open) connections. */
export function connectLive(info: LiveInfo, participant: string, opts: ConnectOptions = {}): LiveConnection {
  const WS = opts.WS ?? WebSocket;
  const baseMs = opts.reconnectBaseMs ?? 1000;
  const maxMs = opts.reconnectMaxMs ?? 15000;
  // Servers send a keepalive every 10 s (older ones every 25 s): 35 s of silence means
  // the server is gone or hung, and waiting longer only keeps the room frozen.
  const staleMs = opts.staleMs ?? 35_000;
  const reloadAfter = opts.reloadAfterAttempts ?? 0;
  const quickMs = opts.quickRetryMs ?? 500;
  const quickWindowMs = opts.quickRetryWindowMs ?? 30_000;
  /** Until when failed reconnects retry quickly: the server announced it is coming back. */
  let quickUntil = 0;
  const onUnrecoverable =
    opts.onUnrecoverable ??
    (() => {
      if (typeof location !== "undefined") location.reload();
    });
  let escalated = false;
  const doc = new Y.Doc();
  const sep = info.ws.includes("?") ? "&" : "?";
  const url = withLiveProtocol(`${info.ws}${sep}p=${encodeURIComponent(participant)}`);
  const statusCbs: Array<(c: boolean) => void> = [];
  const emit = (c: boolean) => statusCbs.forEach((cb) => cb(c));
  const stateCbs: Array<(s: LiveState) => void> = [];
  let state: LiveState = { status: "connecting" };
  const setState = (next: LiveState) => {
    if (next.status === state.status && next.message === state.message) return;
    state = next;
    stateCbs.forEach((cb) => cb(state));
  };

  let ws: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastMsgAt = Date.now();
  let watchdog: ReturnType<typeof setInterval> | undefined;

  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin !== "remote" && ws && ws.readyState === ws.OPEN) ws.send(new Uint8Array(update));
  };
  doc.on("update", onUpdate);

  const schedule = (atOnce = false) => {
    if (closed) return;
    setState({ status: "reconnecting" });
    // A restart or a move is planned: the session is up again on a server within
    // moments, so reconnect now (a little jitter spreads a whole audience), and while
    // it is being placed again keep retrying about every half second rather than
    // backing off into a long wait just as it comes back.
    if (atOnce) {
      attempt = 0;
      quickUntil = Date.now() + quickWindowMs;
      timer = setTimeout(open, Math.random() * 250);
      return;
    }
    if (Date.now() < quickUntil) {
      timer = setTimeout(open, quickMs + Math.random() * quickMs);
      return;
    }
    // Persistent failure → the session is likely gone (re-provisioned). Stop hammering
    // the dead URL and escalate to stable-link recovery exactly once ((internal ticket)).
    if (reloadAfter > 0 && attempt >= reloadAfter && !escalated) {
      escalated = true;
      onUnrecoverable();
      return;
    }
    const delay = Math.min(baseMs * 2 ** attempt, maxMs);
    attempt++;
    timer = setTimeout(open, delay);
  };

  // watchdog: if the socket is OPEN but we've heard nothing within staleMs, the
  // connection is likely half-open, drop it so `close` triggers a reconnect.
  if (staleMs > 0) {
    const period = Math.min(Math.max(Math.floor(staleMs / 3), 20), 30000);
    watchdog = setInterval(() => {
      if (closed || !ws || ws.readyState !== ws.OPEN) return;
      if (Date.now() - lastMsgAt > staleMs) {
        try {
          ws.close();
        } catch {
          /* close handler reconnects */
        }
      }
    }, period);
    (watchdog as { unref?: () => void }).unref?.();
  }

  function open() {
    if (closed) return;
    const sock = new WS(url);
    ws = sock;
    sock.binaryType = "arraybuffer";
    sock.addEventListener("open", () => {
      attempt = 0;
      quickUntil = 0;
      lastMsgAt = Date.now();
      try {
        sock.send(new Uint8Array(Y.encodeStateAsUpdate(doc)));
      } catch {
        /* ignore */
      }
      emit(true);
      setState({ status: "connected" });
    });
    sock.addEventListener("message", (e: MessageEvent) => {
      lastMsgAt = Date.now(); // any frame (update or keepalive) proves liveness
      try {
        Y.applyUpdate(doc, new Uint8Array(e.data as ArrayBuffer), "remote");
      } catch {
        /* ignore malformed frame */
      }
    });
    sock.addEventListener("close", (e?: CloseEvent) => {
      if (ws !== sock) return; // an older socket closing late
      emit(false);
      const code = e?.code ?? 0;
      if (code === LIVE_CLOSE.ENDED) {
        stop();
        setState({ status: "ended" });
        return;
      }
      if (code === LIVE_CLOSE.PROTOCOL_TOO_OLD) {
        stop();
        setState({ status: "outdated", message: e?.reason || "This page is out of date. Reload it to reconnect." });
        return;
      }
      schedule(code === LIVE_CLOSE.RESTARTING || code === LIVE_CLOSE.MOVED || code === LIVE_CLOSE.GRANT_EXPIRED);
    });
    sock.addEventListener("error", () => {
      try {
        sock.close();
      } catch {
        /* the close handler will reconnect */
      }
    });
  }

  /** Stop reconnecting for good (the talk ended, or this client is refused) but
   *  keep the doc: its state stays readable for the end card and results. */
  function stop() {
    closed = true;
    if (timer) clearTimeout(timer);
    if (watchdog) clearInterval(watchdog);
  }

  open();

  return {
    doc,
    onStatus(cb) {
      statusCbs.push(cb);
    },
    onState(cb) {
      stateCbs.push(cb);
      cb(state);
    },
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      if (watchdog) clearInterval(watchdog);
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
