import * as Y from "yjs";

export type Send = (data: Uint8Array) => void;

export interface Peer {
  key: symbol;
  /** feed an update received from this peer into the shared doc */
  recv(data: Uint8Array): void;
  /** detach this peer */
  leave(): void;
}

/** A minimal Yjs relay hub for one session: holds the authoritative doc, sends
 *  full state to newcomers, and broadcasts each update to every *other* peer.
 *  Server-plugin mutations (origin = undefined) broadcast to all. */
export class Hub {
  readonly doc = new Y.Doc();
  private peers = new Map<symbol, Send>();

  constructor() {
    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      for (const [key, send] of this.peers) {
        if (key !== origin) send(update);
      }
    });
  }

  get size(): number {
    return this.peers.size;
  }

  join(send: Send): Peer {
    const key = Symbol("peer");
    this.peers.set(key, send);
    // hand the newcomer the full current state (late-join replay)
    send(Y.encodeStateAsUpdate(this.doc));
    return {
      key,
      recv: (data) => {
        // a malformed/garbage frame must never crash the relay or other peers
        try {
          Y.applyUpdate(this.doc, data, key);
        } catch {
          /* ignore bad update */
        }
      },
      leave: () => {
        this.peers.delete(key);
      },
    };
  }

  destroy(): void {
    this.peers.clear();
    this.doc.destroy();
  }
}
