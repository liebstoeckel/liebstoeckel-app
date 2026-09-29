import * as Y from "yjs";
import type { LiveInfo } from "./detect";
import type { Refusal } from "@liebstoeckel/plugin-sdk";
import { LIVE_CLOSE, type LiveState, parseNotice, withLiveProtocol } from "./protocol";

export interface LiveConnection {
  /** Whether the doc holds the session state yet: false until the server's first state
   *  frame has been applied, then true for good (reconnects keep the doc). Writes to the
   *  empty doc before that race the session's real state. */
  readonly synced: boolean;
  /** Call `cb` once the session state has arrived (at once if it has). Returns an
   *  unsubscribe. */
  onSynced(cb: () => void): () => void;
  /** The shared doc. A viewer's doc is replaced when the server refuses one of its
   *  writes (see {@link onDoc}); read it through here, not once. */
  readonly doc: Y.Doc;
  /** Called with the new doc when the server refused one of this viewer's writes and
   *  sent the session state that replaces the doc. The old doc is destroyed afterwards. */
  onDoc(cb: (doc: Y.Doc) => void): void;
  /** This viewer's refused writes by doc root (e.g. `plugin:poll`), called at once and
   *  on every change. An entry stays until the viewer writes to that root again. */
  onRefusals(cb: (refusals: ReadonlyMap<string, Refusal>) => void): void;
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
  /** Give up on a connection attempt that has not opened after this long (ms). */
  connectTimeoutMs?: number;
  /** After a planned close (restarting, moved), retry about this often (ms, plus up to
   *  as much jitter) instead of backing off, for `quickRetryWindowMs`. */
  quickRetryMs?: number;
  quickRetryWindowMs?: number;
  /** After the server dropped one of our updates (close 4007) the client reconnects at
   *  once and resends its state. Another such close within this window (ms) means it
   *  keeps happening: show the `sending` hint and back off instead. */
  dropWindowMs?: number;
  /** Shortest time the `sending` hint stays up, so it does not flicker (ms). */
  sendingHintMs?: number;
  /** After this many doc replacements on one connection, reconnect: the server lets
   *  one connection bring in a limited number of client ids, and each replacement
   *  writes under a new one. */
  maxResetsPerConnection?: number;
}

/** The doc roots a transaction changed, by name. */
function changedRoots(doc: Y.Doc, tr: Y.Transaction): Set<string> {
  const out = new Set<string>();
  for (const type of tr.changed.keys()) {
    let t = type as Y.AbstractType<unknown>;
    while (t._item) t = t._item.parent as Y.AbstractType<unknown>;
    for (const [name, root] of doc.share) {
      if (root === t) {
        out.add(name);
        break;
      }
    }
  }
  return out;
}

/** A fresh Yjs client id (Yjs itself uses a random uint32). */
function newClientId(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]!;
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
  const connectTimeoutMs = opts.connectTimeoutMs ?? 10_000;
  let attemptAt = 0;
  const quickWindowMs = opts.quickRetryWindowMs ?? 30_000;
  const dropWindowMs = opts.dropWindowMs ?? 15_000;
  const sendingHintMs = opts.sendingHintMs ?? 2000;
  const maxResets = opts.maxResetsPerConnection ?? 16;
  /** When the server last closed us for a dropped update, and how many such closes
   *  came in a row, each within `dropWindowMs` of the one before. */
  let lastDropAt = -Infinity;
  let dropStreak = 0;
  let sendingSince = 0;
  let sendingTimer: ReturnType<typeof setTimeout> | undefined;
  /** Until when failed reconnects retry quickly: the server announced it is coming back. */
  let quickUntil = 0;
  const onUnrecoverable =
    opts.onUnrecoverable ??
    (() => {
      if (typeof location !== "undefined") location.reload();
    });
  let escalated = false;
  let doc = new Y.Doc();
  const docCbs: Array<(d: Y.Doc) => void> = [];
  let refusals: ReadonlyMap<string, Refusal> = new Map();
  const refusalCbs: Array<(r: ReadonlyMap<string, Refusal>) => void> = [];
  const setRefusals = (next: ReadonlyMap<string, Refusal>) => {
    refusals = next;
    refusalCbs.forEach((cb) => cb(refusals));
  };
  /** Set by a `reset` notice: the next binary frame is the state that replaces the doc. */
  let resetNext = false;
  /** Doc replacements on the current connection. */
  let resets = 0;
  const sep = info.ws.includes("?") ? "&" : "?";
  const url = withLiveProtocol(`${info.ws}${sep}p=${encodeURIComponent(participant)}`);
  /** The server's resume token (viewers): sent back on reconnect so the server knows the
   *  client ids of the earlier connections are this client's, and takes the writes the
   *  resync carries on them. */
  let resume: string | undefined;
  let synced = false;
  let syncedCbs: Array<() => void> = [];
  const markSynced = () => {
    if (synced) return;
    synced = true;
    const cbs = syncedCbs;
    syncedCbs = [];
    cbs.forEach((cb) => cb());
  };
  const statusCbs: Array<(c: boolean) => void> = [];
  const emit = (c: boolean) => statusCbs.forEach((cb) => cb(c));
  const stateCbs: Array<(s: LiveState) => void> = [];
  let state: LiveState = { status: "connecting" };
  const setState = (next: LiveState) => {
    if (
      next.status === state.status &&
      next.message === state.message &&
      next.sending === state.sending &&
      next.refusing === state.refusing
    )
      return;
    state = next;
    stateCbs.forEach((cb) => cb(state));
  };
  /** Keep the `sending` hint on the state while it is up. */
  const withHint = (next: LiveState): LiveState => (sendingSince ? { ...next, sending: true } : next);

  let ws: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastMsgAt = Date.now();
  let watchdog: ReturnType<typeof setInterval> | undefined;

  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin !== "remote" && ws && ws.readyState === ws.OPEN) ws.send(new Uint8Array(update));
  };
  // A refusal stays shown until the viewer writes to the same place again.
  const onTransaction = (tr: Y.Transaction) => {
    if (refusals.size === 0 || tr.origin === "remote") return;
    const touched = changedRoots(tr.doc, tr);
    if (![...touched].some((r) => refusals.has(r))) return;
    const next = new Map(refusals);
    for (const r of touched) next.delete(r);
    setRefusals(next);
  };
  doc.on("update", onUpdate);
  doc.on("afterTransaction", onTransaction);

  /** Replace the doc with the session state the server sent after refusing one of our
   *  writes. The old doc still shows the refused write (and anything built on it, which
   *  the server turned into placeholders too), so it cannot be fixed in place; the new
   *  doc holds exactly what the presenter has and writes under a fresh client id. */
  function reset(state: Uint8Array) {
    const next = new Y.Doc();
    try {
      Y.applyUpdate(next, state, "remote");
    } catch {
      next.destroy();
      return;
    }
    const old = doc;
    old.off("update", onUpdate);
    old.off("afterTransaction", onTransaction);
    doc = next;
    doc.on("update", onUpdate);
    doc.on("afterTransaction", onTransaction);
    docCbs.forEach((cb) => cb(doc));
    old.destroy();
  }

  /** Remember a refused write per root, for the viewer's message. */
  function refused(reason: Refusal["reason"], roots: string[]) {
    const at = Date.now();
    const next = new Map(refusals);
    for (const root of roots) next.set(root, { reason, at });
    setRefusals(next);
  }

  const schedule = (atOnce = false, delayMs?: number) => {
    if (closed) return;
    // A viewer's writes on the next connection go out under a new Yjs client id. The
    // relay only fills the clocks of ids a connection brought in itself when it refuses
    // a write, so writes under a fresh id never stay stuck behind a refused one.
    if (info.role === "viewer") doc.clientID = newClientId();
    setState(withHint({ status: "reconnecting" }));
    if (delayMs !== undefined) {
      timer = setTimeout(open, delayMs);
      return;
    }
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
    const period = Math.min(Math.max(Math.floor(Math.min(staleMs, connectTimeoutMs) / 3), 20), 30000);
    watchdog = setInterval(() => {
      if (closed || !ws) return;
      const silent = ws.readyState === ws.OPEN && Date.now() - lastMsgAt > staleMs;
      const stuck = ws.readyState === ws.CONNECTING && Date.now() - attemptAt > connectTimeoutMs;
      if (silent || stuck) abandon(ws);
    }, period);
    (watchdog as { unref?: () => void }).unref?.();
  }

  /** Give up on a socket and reconnect now. A hung server never answers the closing
   *  handshake, so the browser's `close` event would only come when the connection
   *  finally dies: do not wait for it. */
  function abandon(sock: WebSocket) {
    if (ws !== sock) return;
    ws = null;
    try {
      sock.close();
    } catch {
      /* already closing */
    }
    emit(false);
    schedule();
  }

  function open() {
    if (closed) return;
    attemptAt = Date.now();
    const sock = new WS(resume ? `${url}&r=${resume}` : url);
    ws = sock;
    sock.binaryType = "arraybuffer";
    sock.addEventListener("open", () => {
      resetNext = false;
      resets = 0;
      attempt = 0;
      quickUntil = 0;
      lastMsgAt = Date.now();
      try {
        sock.send(new Uint8Array(Y.encodeStateAsUpdate(doc)));
      } catch {
        /* ignore */
      }
      emit(true);
      // a presenter hears again whether audience input is being refused
      setState(withHint({ status: "connected" }));
      // The resync just went out: take the `sending` hint down once it has shown long
      // enough not to flicker.
      if (sendingSince) {
        if (sendingTimer) clearTimeout(sendingTimer);
        sendingTimer = setTimeout(() => {
          if (ws !== sock || sock.readyState !== sock.OPEN) return;
          sendingSince = 0;
          setState({ ...state, sending: undefined });
        }, Math.max(0, sendingSince + sendingHintMs - Date.now()));
      }
    });
    sock.addEventListener("message", (e: MessageEvent) => {
      lastMsgAt = Date.now(); // any frame (update or keepalive) proves liveness
      if (typeof e.data === "string") {
        const notice = parseNotice(e.data);
        if (notice?.t === "refused") refused(notice.reason, notice.roots);
        else if (notice?.t === "reset") resetNext = true;
        else if (notice?.t === "refusing") setState({ ...state, refusing: notice.reason ?? undefined });
        else if (notice?.t === "resume") resume = notice.token;
        return;
      }
      const bytes = new Uint8Array(e.data as ArrayBuffer);
      if (resetNext) {
        resetNext = false;
        reset(bytes);
        markSynced();
        // Each replacement writes under a new client id, and the server only lets one
        // connection bring in so many: start a fresh connection before running out.
        if (++resets >= maxResets) abandon(sock);
        return;
      }
      try {
        Y.applyUpdate(doc, bytes, "remote");
      } catch {
        /* ignore malformed frame */
      }
      // the first binary frame on a connection is the server's whole state
      markSynced();
    });
    sock.addEventListener("close", (e?: CloseEvent) => {
      if (ws !== sock) return; // an older socket closing late
      emit(false);
      // the server says again on the next connection if it is still refusing
      if (state.refusing) setState({ ...state, refusing: undefined });
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
      if (code === LIVE_CLOSE.DROPPED) {
        // One of our updates was refused, so the server cannot apply our later ones
        // until we send everything again: reconnect at once, which resends it all. If
        // it keeps happening, say so and back off rather than reconnect in a loop.
        const now = Date.now();
        dropStreak = now - lastDropAt < dropWindowMs ? dropStreak + 1 : 0;
        lastDropAt = now;
        if (dropStreak === 0) {
          schedule(true);
          return;
        }
        if (!sendingSince) sendingSince = now;
        schedule(false, Math.min(baseMs * 2 ** (dropStreak - 1), maxMs));
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
    if (sendingTimer) clearTimeout(sendingTimer);
    sendingSince = 0;
    if (watchdog) clearInterval(watchdog);
  }

  open();

  return {
    get synced() {
      return synced;
    },
    onSynced(cb) {
      if (synced) {
        cb();
        return () => {};
      }
      syncedCbs.push(cb);
      return () => {
        syncedCbs = syncedCbs.filter((c) => c !== cb);
      };
    },
    get doc() {
      return doc;
    },
    onDoc(cb) {
      docCbs.push(cb);
    },
    onRefusals(cb) {
      refusalCbs.push(cb);
      cb(refusals);
    },
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
      if (sendingTimer) clearTimeout(sendingTimer);
      if (watchdog) clearInterval(watchdog);
      doc.off("update", onUpdate);
      doc.off("afterTransaction", onTransaction);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      doc.destroy();
    },
  };
}
