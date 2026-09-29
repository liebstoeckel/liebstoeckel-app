import * as Y from "yjs";
import {
  AudienceGate,
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

/** Why the relay refused an audience peer's update. `full`: the relay is short of
 *  memory and takes no audience writes until it has room again. */
export type DropReason = "rate" | "scope" | "full";

/** What the relay knows about a refused update, for telling the peer. */
export interface DropInfo {
  /** the refused range was filled with a placeholder, so the peer's later updates apply */
  tombstoned: boolean;
  /** `scope` drops only: the update would have taken a field over its entry cap (the
   *  field is full), as opposed to writing outside the scope or out of bounds */
  fieldFull?: boolean;
  /** the doc roots the refused update touched (e.g. `plugin:poll`), at most a few */
  roots: string[];
  /** the update wrote something (it was not only deletions) */
  adds: boolean;
}

export interface JoinOptions {
  /** Called when one of this peer's updates is refused. `rate`: the peer's later
   *  updates cannot apply until it sends its full state again, so the caller should
   *  close the connection (the client reconnects and resyncs) and the peer ignores
   *  every further update until then. `scope` and `full`: the refused range was filled
   *  with a placeholder (`tombstoned`) so the peer's later updates still apply, or, when
   *  that was not safe, simply dropped; a resync would be refused the same way, so there
   *  is nothing to close for. */
  onDrop?: (reason: DropReason, info: DropInfo) => void;
  /** Called after one of this (enforced) peer's updates was accepted and applied. */
  onAccept?: () => void;
}

/** Most roots named for one refused update. */
const MAX_ROOTS = 8;

/** The names of the doc roots `update` touches, read from its structs and deletions, and
 *  whether it writes anything. An item in the update names its parent directly, through
 *  an item of the same update, or through an item the doc already holds. Best effort:
 *  never throws. */
export function describeUpdate(update: Uint8Array, doc: Y.Doc): { roots: string[]; adds: boolean } {
  const out = new Set<string>();
  let adds = false;
  try {
    const { structs, ds } = Y.decodeUpdate(update);
    adds = structs.some((s) => s instanceof Y.Item);
    const own = new Map<string, Y.Item>();
    for (const s of structs) if (s instanceof Y.Item) own.set(`${s.id.client}:${s.id.clock}`, s);
    const known = (id: Y.ID | null): Y.Item | undefined => {
      if (!id) return undefined;
      const mine = own.get(`${id.client}:${id.clock}`);
      if (mine) return mine;
      if (id.clock >= Y.getState(doc.store, id.client)) return undefined;
      const s = Y.getItem(doc.store, id);
      return s instanceof Y.Item ? s : undefined;
    };
    const rootOf = (item: Y.Item | undefined, depth: number): string | undefined => {
      if (!item || depth > 32) return undefined;
      const parent = item.parent as unknown;
      if (typeof parent === "string") return parent;
      if (parent instanceof Y.AbstractType) {
        let root = parent as Y.AbstractType<unknown>;
        while (root._item) root = root._item.parent as Y.AbstractType<unknown>;
        return Y.findRootTypeKey(root);
      }
      if (parent instanceof Y.ID) return rootOf(known(parent), depth + 1);
      // a decoded item with a neighbour names no parent: it has its neighbour's
      return rootOf(known(item.origin) ?? known(item.rightOrigin), depth + 1);
    };
    for (const s of structs) {
      if (out.size >= MAX_ROOTS) break;
      if (!(s instanceof Y.Item)) continue;
      const root = rootOf(s, 0);
      if (root !== undefined) out.add(root);
    }
    for (const [client, items] of ds.clients) {
      for (const d of items) {
        if (out.size >= MAX_ROOTS) break;
        const root = rootOf(known(Y.createID(client, d.clock)), 0);
        if (root !== undefined) out.add(root);
      }
    }
  } catch {
    /* a malformed update names nothing */
  }
  return { roots: [...out], adds };
}

/** Most client ids one peer can own: a real client uses one per connection. */
const MAX_OWNED_CLIENTS = 64;

export interface AudiencePolicy {
  /** which doc areas an audience peer may write ((internal ADR)). */
  scope: AudienceScope;
  /** per-audience-peer write rate limit; omit for no limit. */
  rate?: { capacity: number; refillPerSec: number };
  /** Asked before each audience write; false refuses it as `full`. A relay uses it to
   *  stop audience writes when its process runs short of memory, rather than be killed
   *  with every session on it. */
  admit?: () => boolean;
  /** Lower entry caps per field, for testing a full field (see `AudienceGate`). */
  caps?: { entries?: number; tallyEntries?: number };
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
  /** If set, updates that follow each other within this many ms go out as one merged
   *  frame per peer at the end of the window, instead of one frame per update per peer.
   *  The first update after a quiet window still goes out at once, so a lone change (a
   *  slide change) is not delayed. With a large audience voting, sending every vote to
   *  every viewer on its own is what the relay spends most of its time on. 0/undefined =
   *  every update at once. */
  coalesceMs?: number;
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
  /** Checks audience writes against a shadow of the doc, at the cost of the write, not
   *  of the whole session. */
  private readonly gate?: AudienceGate;
  private readonly coalesceMs: number;
  /** Updates waiting for the end of the current window, and who sent them. */
  private queued: Uint8Array[] = [];
  private queuedFrom = new Set<unknown>();
  private flushTimer?: ReturnType<typeof setTimeout>;
  private lastSentAt = -Infinity;

  constructor(opts: HubOptions = {}) {
    this.audience = opts.audience;
    this.coalesceMs = opts.coalesceMs && opts.coalesceMs > 0 ? opts.coalesceMs : 0;
    if (opts.audience) this.gate = new AudienceGate(this.doc, opts.audience.scope, opts.audience.caps);
    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (this.coalesceMs === 0) return this.broadcast(update, origin);
      const now = Date.now();
      if (this.flushTimer === undefined && now - this.lastSentAt >= this.coalesceMs) {
        this.lastSentAt = now;
        return this.broadcast(update, origin);
      }
      this.queued.push(update);
      this.queuedFrom.add(origin);
      this.flushTimer ??= setTimeout(() => this.flush(), Math.max(0, this.coalesceMs - (now - this.lastSentAt)));
    });
    if (opts.keepaliveMs && opts.keepaliveMs > 0) {
      this.keepalive = setInterval(() => {
        for (const [key, send] of this.peers) this.deliver(key, send, KEEPALIVE);
      }, opts.keepaliveMs);
      // don't keep the process alive just for keepalives
      (this.keepalive as { unref?: () => void }).unref?.();
    }
  }

  /** Send one update to every peer except the one it came from. */
  private broadcast(update: Uint8Array, origin: unknown): void {
    for (const [key, send] of this.peers) {
      if (key !== origin) this.deliver(key, send, update);
    }
  }

  /** Send the window's updates as one merged frame. It goes to every peer, the senders
   *  included (applying an update twice changes nothing), unless one peer sent them all. */
  private flush(): void {
    this.flushTimer = undefined;
    if (this.queued.length === 0) return;
    const merged = this.queued.length === 1 ? this.queued[0]! : Y.mergeUpdates(this.queued);
    const only = this.queuedFrom.size === 1 ? [...this.queuedFrom][0] : undefined;
    this.queued = [];
    this.queuedFrom.clear();
    this.lastSentAt = Date.now();
    this.broadcast(merged, only);
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
              opts.onDrop?.("rate", { tombstoned: false, roots: [], adds: false });
              return;
            }
            if (this.audience!.admit && !this.audience!.admit()) {
              const seen = describeUpdate(data, this.doc);
              opts.onDrop?.("full", { tombstoned: tombstone(data), ...seen });
              return;
            }
            if (!this.gate!.check(data)) {
              // out-of-scope or out-of-bounds write → never applied or broadcast
              const seen = describeUpdate(data, this.doc);
              const fieldFull = this.gate!.lastRefusal === "cap";
              opts.onDrop?.("scope", { tombstoned: tombstone(data), fieldFull, ...seen });
              return;
            }
            claim(data);
            this.gate!.apply(data, key);
            opts.onAccept?.();
            return;
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
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.gate?.destroy();
    this.peers.clear();
    this.doc.destroy();
  }
}
