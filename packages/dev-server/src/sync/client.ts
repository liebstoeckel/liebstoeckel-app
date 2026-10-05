// A participant in a deck's live document over the sync service's WebSocket.
// Browser-safe: uses the global WebSocket, so the dashboard and the CLI share
// it. Reconnects with a jittered backoff and resends its state after a
// reconnect, so edits made while offline are not lost. When the server says it
// is restarting, or the deck moved, it reconnects at once; when the server no
// longer speaks this client's protocol, it stops and says why.

import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import * as Y from "yjs";
import {
  MSG_AWARENESS,
  MSG_READY,
  MSG_UPDATE,
  type ServerNotice,
  decodeFrame,
  encodeFrame,
  CLOSE,
  isFatalClose,
  reconnectsAtOnce,
  withProtocol,
} from "./wire.ts";

export type SyncStatus = "connecting" | "open" | "closed" | "failed";

/** Passed to a `url` function on every (re)connect. */
export interface ConnectContext {
  /** The last grant was refused or ran out (the server closed for an expired
   *  grant, or the last attempt never got a connection): fetch a fresh one
   *  rather than trusting this machine's clock about the old one. */
  renewGrant: boolean;
}

/** Backoff after a failed or unhealthy connection: doubles from this, capped. */
const BACKOFF_BASE_MS = 250;
const BACKOFF_MAX_MS = 10_000;
/** A connection that stayed ready this long counts as healthy and resets the backoff. */
const HEALTHY_MS = 5_000;
/** After a planned close (restart, move, new grant) the next owner may take a moment:
 *  failed attempts retry about this often for {@link QUICK_WINDOW_MS}, then back off. */
const QUICK_RETRY_MS = 500;
const QUICK_WINDOW_MS = 30_000;

export interface SyncClientOptions {
  /** `ws(s)://<host>/d/<deck>/ws?t=<grant>`, or a function returning one, called
   *  on every (re)connect so an expired grant can be replaced. */
  url: string | ((ctx: ConnectContext) => string | Promise<string>);
  doc?: Y.Doc;
  /** Reconnect after a drop (default true). */
  reconnect?: boolean;
  onReady?: () => void;
  onNotice?: (notice: ServerNotice) => void;
  onStatus?: (status: SyncStatus) => void;
  /** The server refused this client for good (status "failed"): a message
   *  for the user, e.g. to update the CLI or reload the page. */
  onFatal?: (message: string) => void;
}

export class SyncClient {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  private ws: WebSocket | null = null;
  private closed = false;
  private attempts = 0;
  private everReady = false;
  /** When the current connection got the server's READY, or null before. */
  private readyAt: number | null = null;
  /** Until when failed attempts retry quickly: a planned close said the deck is back soon. */
  private quickUntil = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private renewGrant = false;
  /** The last error notice, which explains a fatal close. */
  private lastError: string | null = null;
  private resolveReady!: () => void;
  /** Resolves once the first initial state has arrived. */
  readonly ready: Promise<void>;
  isReady = false;

  constructor(private readonly opts: SyncClientOptions) {
    this.doc = opts.doc ?? new Y.Doc();
    this.awareness = new Awareness(this.doc);
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
    this.doc.on("update", this.onDocUpdate);
    this.awareness.on("update", this.onAwarenessUpdate);
    if (typeof globalThis.addEventListener === "function") globalThis.addEventListener("online", this.onOnline);
    this.connect();
  }

  /** The browser says the network is back: a reconnect waiting out its backoff goes now. */
  private onOnline = () => {
    if (this.closed || this.timer === undefined) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.connect();
  };

  private later(ms: number): void {
    if (this.closed) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.connect();
    }, ms);
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this) return;
    this.send(encodeFrame(MSG_UPDATE, update));
  };

  private onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin === this) return;
    const changed = [...added, ...updated, ...removed];
    this.send(encodeFrame(MSG_AWARENESS, encodeAwarenessUpdate(this.awareness, changed)));
  };

  private send(frame: Uint8Array<ArrayBuffer>): void {
    // Before the first READY we must not push content: the server's files
    // come first. Updates made meanwhile are resent in full on READY.
    if (this.ws?.readyState === 1 && this.isReady) this.ws.send(frame);
  }

  private connect(): void {
    if (this.closed) return;
    this.opts.onStatus?.("connecting");
    const { url } = this.opts;
    const ctx: ConnectContext = { renewGrant: this.renewGrant };
    Promise.resolve()
      .then(() => (typeof url === "function" ? url(ctx) : url))
      .then(
        (resolved) => this.open(resolved),
        () => this.retry(),
      );
  }

  private retry(): void {
    if (this.closed || this.opts.reconnect === false) return;
    if (Date.now() < this.quickUntil) return this.later(QUICK_RETRY_MS * (1 + Math.random()));
    // Up to half again as long, at random: every editor of a deck lost its socket at
    // the same moment, and they must not all come back in the same one.
    const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** this.attempts++) * (1 + Math.random() / 2);
    this.later(delay);
  }

  private open(url: string): void {
    if (this.closed) return;
    const ws = new WebSocket(withProtocol(url));
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    this.isReady = false;
    this.readyAt = null;
    let opened = false;
    ws.onopen = () => {
      opened = true;
      this.opts.onStatus?.("open");
    };
    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        try {
          const notice = JSON.parse(event.data) as ServerNotice;
          if (notice.type === "error") this.lastError = notice.message;
          this.opts.onNotice?.(notice);
        } catch {
          // ignore
        }
        return;
      }
      const frame = decodeFrame(new Uint8Array(event.data as ArrayBuffer));
      if (!frame) return;
      if (frame.type === MSG_UPDATE) Y.applyUpdate(this.doc, frame.payload, this);
      else if (frame.type === MSG_AWARENESS) applyAwarenessUpdate(this.awareness, frame.payload, this);
      else if (frame.type === MSG_READY) this.onServerReady();
    };
    ws.onclose = (event) => {
      if (this.ws !== ws) return;
      this.isReady = false;
      const readyAt = this.readyAt;
      this.readyAt = null;
      // Only a connection that worked for a while resets the backoff: a server that
      // opens and closes again at once (it cannot load the deck, it refuses an update)
      // must not be asked again every quarter second.
      if (readyAt !== null && Date.now() - readyAt >= HEALTHY_MS) this.attempts = 0;
      // A refused upgrade (an expired or revoked grant among other things) never opens.
      this.renewGrant = event.code === CLOSE.GRANT_EXPIRED || !opened;
      if (isFatalClose(event.code)) {
        this.closed = true;
        this.opts.onStatus?.("failed");
        const fallback = event.code === CLOSE.ENDED ? "This session has ended." : "The sync service no longer supports this client.";
        this.opts.onFatal?.(this.lastError ?? (event.reason || fallback));
        return;
      }
      this.opts.onStatus?.("closed");
      if (reconnectsAtOnce(event.code) && !this.closed && this.opts.reconnect !== false) {
        if (readyAt !== null) {
          // A restart, a move to another server or a fresh grant: nothing is
          // wrong, so no backoff. A little jitter spreads a whole deck's clients,
          // and while the deck is placed again failed attempts retry quickly.
          this.attempts = 0;
          this.quickUntil = Date.now() + QUICK_WINDOW_MS;
          this.later(Math.random() * 100);
          return;
        }
        // Turned away before it was ready (the deck is still being placed): retry
        // quickly for a while, not in a tight loop.
        if (this.quickUntil === 0) this.quickUntil = Date.now() + QUICK_WINDOW_MS;
      }
      this.retry();
    };
    ws.onerror = () => {
      // onclose follows
    };
  }

  private onServerReady(): void {
    this.isReady = true;
    this.readyAt = Date.now();
    this.quickUntil = 0;
    this.renewGrant = false;
    // After a reconnect, send everything we have: the server ignores what it
    // already knows and gains whatever we did while offline.
    if (this.everReady) this.ws?.send(encodeFrame(MSG_UPDATE, Y.encodeStateAsUpdate(this.doc)));
    // Announce ourselves again under a new awareness clock (setting the state
    // sends it). The server dropped our presence when the last socket closed but
    // remembers its clock, and would ignore the same clock sent again: others
    // would not see us until the next periodic renewal.
    const local = this.awareness.getLocalState();
    if (local) this.awareness.setLocalState(local);
    if (!this.everReady) {
      this.everReady = true;
      this.resolveReady();
    }
    this.opts.onReady?.();
  }

  close(): void {
    this.closed = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    if (typeof globalThis.removeEventListener === "function") globalThis.removeEventListener("online", this.onOnline);
    this.awareness.setLocalState(null);
    this.doc.off("update", this.onDocUpdate);
    this.awareness.off("update", this.onAwarenessUpdate);
    this.ws?.close();
  }
}
