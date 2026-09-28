import * as Y from "yjs";
import {
  authorizeAudienceUpdate,
  tokenBucket,
  type AudienceScope,
  type PeerRole,
  type TokenBucket,
} from "@liebstoeckel/plugin-sdk/authorize";
import { newRanges, tombstoneUpdate } from "./tombstone";

export type Send = (data: Uint8Array) => void;

export interface Peer {
  key: symbol;
  /** feed an update received from this peer into the shared doc */
  recv(data: Uint8Array): void;
  /** detach this peer */
  leave(): void;
}

/** Why the relay refused an audience peer's update. */
export type DropReason = "rate" | "scope";

export interface JoinOptions {
  /** Called when one of this peer's updates is refused. `rate`: the peer's later
   *  updates cannot apply until it sends its full state again, so the caller should
   *  close the connection (the client reconnects and resyncs) and the peer ignores
   *  every further update until then. `scope`: the refused range was filled with a
   *  placeholder (`tombstoned`) so the peer's later updates still apply, or, when that
   *  was not safe, simply dropped; a resync would be refused the same way, so there is
   *  nothing to close for. */
  onDrop?: (reason: DropReason, info: { tombstoned: boolean }) => void;
}

/** Most client ids one peer can own: a real client uses one per connection. */
const MAX_OWNED_CLIENTS = 64;

export interface AudiencePolicy {
  /** which doc areas an audience peer may write ((internal ADR)). */
  scope: AudienceScope;
  /** per-audience-peer write rate limit; omit for no limit. */
  rate?: { capacity: number; refillPerSec: number };
}

export interface HubOptions {
  /** if set, periodically send a benign keepalive frame to every peer so quiet
   *  sessions still surface a "message" on the client (drives its watchdog) and
   *  dead peers are pruned. 0/undefined = off. */
  keepaliveMs?: number;
  /** if set, `audience`-role peers are write-scope enforced ((internal ADR)): updates that
   *  touch anything outside the scope are dropped, not applied. Absent → no
   *  enforcement (every peer may write, the local/LAN trusted model, (internal ADR)). */
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

  /** Encode the full doc state as opaque Yjs update bytes, for persisting a session
   *  snapshot to object storage ((internal ADR)). Persisting bytes runs no deck code. */
  snapshot(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }

  /** Seed the doc from a prior snapshot (re-seed on relay restart). No-op on garbage. */
  seed(update: Uint8Array): void {
    try {
      Y.applyUpdate(this.doc, update);
    } catch {
      /* ignore bad seed */
    }
  }

  join(send: Send, role: PeerRole = "presenter", opts: JoinOptions = {}): Peer {
    const key = Symbol("peer");
    this.peers.set(key, send);
    // hand the newcomer the full current state (late-join replay)
    this.deliver(key, send, Y.encodeStateAsUpdate(this.doc));

    // An audience peer is write-scope enforced when a policy is configured ((internal ADR));
    // presenter/runner peers are trusted and write the whole doc. With no policy the
    // Hub is the open, trusted relay ((internal ADR)), every peer may write.
    const enforced = role === "audience" && this.audience !== undefined;
    const bucket: TokenBucket | undefined =
      enforced && this.audience!.rate
        ? tokenBucket(this.audience!.rate.capacity, this.audience!.rate.refillPerSec)
        : undefined;
    // Yjs client ids this peer brought into the doc. Only their clocks may be filled
    // with placeholders after a refused write: doing that for an id another peer uses
    // would make the relay skip that peer's next real writes.
    const owned = new Set<number>();
    // After a rate drop the peer's later updates cannot apply until it resyncs.
    let awaitingResync = false;

    const claim = (update: Uint8Array) => {
      const { from } = Y.parseUpdateMeta(update);
      for (const [client, clock] of from) {
        if (owned.size >= MAX_OWNED_CLIENTS) return;
        if (clock === 0 && Y.getState(this.doc.store, client) === 0) owned.add(client);
      }
    };

    /** Fill a refused update's new clock ranges with placeholders, if they all belong
     *  to this peer. Returns whether it did. */
    const tombstone = (update: Uint8Array): boolean => {
      claim(update);
      const state = Y.decodeStateVector(Y.encodeStateVector(this.doc));
      const ranges = newRanges(update, state);
      // Each range must continue the id's clock exactly: a placeholder after a gap would
      // wait in the doc, and could later let parked content in unchecked.
      if (ranges.some((r) => !owned.has(r.client) || r.clock !== (state.get(r.client) ?? 0))) return false;
      if (ranges.length > 0) Y.applyUpdate(this.doc, tombstoneUpdate(ranges), key);
      return true;
    };

    return {
      key,
      recv: (data) => {
        if (awaitingResync) return;
        // a malformed/garbage frame must never crash the relay or other peers
        try {
          if (enforced) {
            if (bucket && !bucket.tryConsume(Date.now())) {
              // rate-limited → drop, and have the client resend everything once it
              // reconnects (its later updates would otherwise wait for this one forever)
              awaitingResync = true;
              opts.onDrop?.("rate", { tombstoned: false });
              return;
            }
            if (!authorizeAudienceUpdate(Y.encodeStateAsUpdate(this.doc), data, this.audience!.scope)) {
              // out-of-scope or out-of-bounds write → never applied or broadcast
              opts.onDrop?.("scope", { tombstoned: tombstone(data) });
              return;
            }
            claim(data);
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
