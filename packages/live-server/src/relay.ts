import * as Y from "yjs";
import {
  authorizeAudienceUpdate,
  tokenBucket,
  type AudienceScope,
  type PeerRole,
  type TokenBucket,
} from "@liebstoeckel/plugin-sdk/authorize";

export type Send = (data: Uint8Array) => void;

export interface Peer {
  key: symbol;
  /** feed an update received from this peer into the shared doc */
  recv(data: Uint8Array): void;
  /** detach this peer */
  leave(): void;
}

export interface AudiencePolicy {
  /** which doc areas an audience peer may write (ADR 0061). */
  scope: AudienceScope;
  /** per-audience-peer write rate limit; omit for no limit. */
  rate?: { capacity: number; refillPerSec: number };
}

export interface HubOptions {
  /** if set, periodically send a benign keepalive frame to every peer so quiet
   *  sessions still surface a "message" on the client (drives its watchdog) and
   *  dead peers are pruned. 0/undefined = off. */
  keepaliveMs?: number;
  /** if set, `audience`-role peers are write-scope enforced (ADR 0061): updates that
   *  touch anything outside the scope are dropped, not applied. Absent → no
   *  enforcement (every peer may write — the local/LAN trusted model, ADR 0012). */
  audience?: AudiencePolicy;
}

// A valid Yjs update for an empty doc: applying it is a no-op (no structs), but
// it's a real frame, so the client's message handler fires and resets its
// liveness watchdog without mutating any state.
const KEEPALIVE: Uint8Array = Y.encodeStateAsUpdate(new Y.Doc());

/** A minimal Yjs relay hub for one session: holds the authoritative doc, sends
 *  full state to newcomers, and broadcasts each update to every *other* peer.
 *  Server-plugin mutations (origin = undefined) broadcast to all. */
export class Hub {
  readonly doc = new Y.Doc();
  private peers = new Map<symbol, Send>();
  private keepalive?: ReturnType<typeof setInterval>;
  private readonly audience?: AudiencePolicy;

  constructor(opts: HubOptions = {}) {
    this.audience = opts.audience;
    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      for (const [key, send] of this.peers) {
        if (key !== origin) this.deliver(key, send, update);
      }
    });
    if (opts.keepaliveMs && opts.keepaliveMs > 0) {
      this.keepalive = setInterval(() => {
        for (const [key, send] of this.peers) this.deliver(key, send, KEEPALIVE);
      }, opts.keepaliveMs);
      // don't keep the process alive just for keepalives
      (this.keepalive as { unref?: () => void }).unref?.();
    }
  }

  /** Send to one peer; a failing send (dead/closing socket) drops that peer
   *  rather than throwing out of the broadcast loop and starving the others. */
  private deliver(key: symbol, send: Send, data: Uint8Array): void {
    try {
      send(data);
    } catch {
      this.peers.delete(key);
    }
  }

  get size(): number {
    return this.peers.size;
  }

  join(send: Send, role: PeerRole = "presenter"): Peer {
    const key = Symbol("peer");
    this.peers.set(key, send);
    // hand the newcomer the full current state (late-join replay)
    this.deliver(key, send, Y.encodeStateAsUpdate(this.doc));

    // An audience peer is write-scope enforced when a policy is configured (ADR 0061);
    // presenter/runner peers are trusted and write the whole doc. With no policy the
    // Hub is the open, trusted relay (ADR 0012) — every peer may write.
    const enforced = role === "audience" && this.audience !== undefined;
    const bucket: TokenBucket | undefined =
      enforced && this.audience!.rate
        ? tokenBucket(this.audience!.rate.capacity, this.audience!.rate.refillPerSec)
        : undefined;

    return {
      key,
      recv: (data) => {
        // a malformed/garbage frame must never crash the relay or other peers
        try {
          if (enforced) {
            if (bucket && !bucket.tryConsume(Date.now())) return; // rate-limited → drop
            if (!authorizeAudienceUpdate(Y.encodeStateAsUpdate(this.doc), data, this.audience!.scope)) {
              return; // out-of-scope write → drop, never applied/broadcast
            }
          }
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
    if (this.keepalive) clearInterval(this.keepalive);
    this.peers.clear();
    this.doc.destroy();
  }
}
