// A participant in a deck's live document over the sync service's WebSocket.
// Browser-safe: uses the global WebSocket, so the dashboard and the CLI share
// it. Reconnects with backoff and resends its state after a reconnect, so
// edits made while offline are not lost.

import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import * as Y from "yjs";
import { MSG_AWARENESS, MSG_READY, MSG_UPDATE, type ServerNotice, decodeFrame, encodeFrame } from "./wire.ts";

export interface SyncClientOptions {
  /** `ws(s)://<host>/d/<deck>/ws?t=<grant>`, or a function returning one, called
   *  on every (re)connect so an expired grant can be replaced. */
  url: string | (() => string | Promise<string>);
  doc?: Y.Doc;
  /** Reconnect after a drop (default true). */
  reconnect?: boolean;
  onReady?: () => void;
  onNotice?: (notice: ServerNotice) => void;
  onStatus?: (status: "connecting" | "open" | "closed") => void;
}

export class SyncClient {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  private ws: WebSocket | null = null;
  private closed = false;
  private attempts = 0;
  private everReady = false;
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
    this.connect();
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
    Promise.resolve(typeof url === "function" ? url() : url).then(
      (resolved) => this.open(resolved),
      () => this.retry(),
    );
  }

  private retry(): void {
    if (this.closed || this.opts.reconnect === false) return;
    const delay = Math.min(10_000, 250 * 2 ** this.attempts++);
    setTimeout(() => this.connect(), delay);
  }

  private open(url: string): void {
    if (this.closed) return;
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    this.isReady = false;
    ws.onopen = () => {
      this.attempts = 0;
      this.opts.onStatus?.("open");
    };
    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        try {
          this.opts.onNotice?.(JSON.parse(event.data) as ServerNotice);
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
    ws.onclose = () => {
      this.isReady = false;
      this.opts.onStatus?.("closed");
      this.retry();
    };
    ws.onerror = () => {
      // onclose follows
    };
  }

  private onServerReady(): void {
    this.isReady = true;
    // After a reconnect, send everything we have: the server ignores what it
    // already knows and gains whatever we did while offline.
    if (this.everReady) this.ws?.send(encodeFrame(MSG_UPDATE, Y.encodeStateAsUpdate(this.doc)));
    const local = this.awareness.getLocalState();
    if (local) {
      this.ws?.send(encodeFrame(MSG_AWARENESS, encodeAwarenessUpdate(this.awareness, [this.doc.clientID])));
    }
    if (!this.everReady) {
      this.everReady = true;
      this.resolveReady();
    }
    this.opts.onReady?.();
  }

  close(): void {
    this.closed = true;
    this.awareness.setLocalState(null);
    this.doc.off("update", this.onDocUpdate);
    this.awareness.off("update", this.onAwarenessUpdate);
    this.ws?.close();
  }
}
