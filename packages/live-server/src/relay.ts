import * as Y from "yjs";
import {
  AudienceGate,
  audienceMayWrite,
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
  /** Who this audience peer is across reconnects, for the Yjs client ids it may write
   *  (see {@link Hub}). Peers with the same `owner` may continue each other's ids; with
   *  none, only this connection may continue the ids it brings in. */
  owner?: string;
  /** Let this audience peer continue an id that was in the stored state the session was
   *  seeded from (a relay restart or move forgets who brought which id in). Only for
   *  clients that keep their id across reconnects (protocol 1 and 2). */
  claimSeeded?: boolean;
  /** Called when an update from this audience peer carried content on Yjs client ids it
   *  may not write, which was removed before the update was checked. */
  onForeign?: () => void;
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

/** Most client ids one connection can bring in: a real client uses one per connection,
 *  plus one per doc replacement after a refusal. */
const MAX_OWNED_CLIENTS = 64;

/** A state vector clock that covers any real clock: diffing against it removes a client. */
const ALL_CLOCKS = Number.MAX_SAFE_INTEGER;

/** Split the Yjs clients in a stored doc into those that only ever wrote what the
 *  audience may write and the rest (the presenter's, the runner's, the relay's own).
 *  An item's place is its root and the key it sits under in that root; an item whose
 *  place cannot be read counts as not audience-writable. */
export function classifyClients(doc: Y.Doc, scope: AudienceScope): { audience: number[]; trusted: number[] } {
  const audience: number[] = [];
  const trusted: number[] = [];
  for (const [client, structs] of doc.store.clients) {
    let onlyAudience = true;
    for (const s of structs) {
      if (!(s instanceof Y.Item)) continue;
      let top: Y.Item = s;
      for (let depth = 0; depth < 64; depth++) {
        const parent = top.parent as Y.AbstractType<unknown> | null;
        if (!(parent instanceof Y.AbstractType) || !parent._item) break;
        top = parent._item;
      }
      const root = top.parent;
      if (!(root instanceof Y.AbstractType) || root._item || !audienceMayWrite(scope, Y.findRootTypeKey(root), top.parentSub)) {
        onlyAudience = false;
        break;
      }
    }
    (onlyAudience ? audience : trusted).push(client);
  }
  return { audience, trusted };
}

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
  /** Which audience owner brought each Yjs client id in (see `join`). An audience update
   *  may add clocks only on ids its owner brought in, or on a fresh id it then brings in
   *  itself. Anything else would let one peer fill another's next clocks, and the relay
   *  would then skip that client's real writes as already known. */
  private readonly owners = new Map<number, string | symbol>();
  /** Ids trusted peers write (presenter, runner, the relay itself): never an audience's. */
  private readonly trusted = new Set<number>();
  /** Ids from the stored state the session was seeded from that only hold audience
   *  content and no one has continued yet. */
  private readonly seeded = new Set<number>();

  constructor(opts: HubOptions = {}) {
    this.audience = opts.audience;
    this.coalesceMs = opts.coalesceMs && opts.coalesceMs > 0 ? opts.coalesceMs : 0;
    if (opts.audience) {
      this.gate = new AudienceGate(this.doc, opts.audience.scope, opts.audience.caps);
      this.trusted.add(this.doc.clientID); // server-plugin writes
    }
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
    if (!this.audience) return;
    // Who brought which id in is not stored. Ids that hold anything the audience may not
    // write are the presenter's or the runner's; the others may be continued by the old
    // clients that keep their id across reconnects (`claimSeeded`).
    const { audience, trusted } = classifyClients(this.doc, this.audience.scope);
    for (const c of trusted) this.trusted.add(c);
    for (const c of audience) if (!this.trusted.has(c) && !this.owners.has(c)) this.seeded.add(c);
  }

  /** Mark the ids a trusted peer's update adds clocks to as trusted, unless an audience
   *  peer brought them in (a presenter's resync carries the audience's structs too). */
  private trust(update: Uint8Array): void {
    const { to } = Y.parseUpdateMeta(update);
    for (const [client, end] of to) {
      if (end <= Y.getState(this.doc.store, client)) continue;
      if (this.owners.has(client) || this.seeded.has(client)) continue;
      this.trusted.add(client);
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
    // Who this peer is for the ids it may write: the owner the caller named (the same
    // client across reconnects), else this connection alone.
    const owner: string | symbol = opts.owner ?? key;
    // ids this connection brought in, bounded
    let claims = 0;
    // After a rate drop the peer's later updates cannot apply until it resyncs.
    let awaitingResync = false;

    /** May this peer add clocks to `client`? `claim`: it may, and the id is not its yet
     *  (a fresh id, or for an old client one from the stored state). */
    const standing = (client: number): "own" | "claim" | "foreign" => {
      if (this.trusted.has(client)) return "foreign";
      const by = this.owners.get(client);
      if (by !== undefined) return by === owner ? "own" : "foreign";
      if (Y.getState(this.doc.store, client) === 0) return "claim";
      if (opts.claimSeeded && this.seeded.has(client)) return "claim";
      return "foreign";
    };

    /** Drop the structs on ids this peer may not write from `update`. Returns the update
     *  to check, and the ids it would bring in. */
    const ownPart = (update: Uint8Array): { update: Uint8Array; claimed: number[] } => {
      const { to } = Y.parseUpdateMeta(update);
      const foreign = new Map<number, number>();
      const claimed: number[] = [];
      for (const [client, end] of to) {
        if (end <= Y.getState(this.doc.store, client)) continue; // nothing new on it
        let st = standing(client);
        if (st === "claim" && claims + claimed.length >= MAX_OWNED_CLIENTS) st = "foreign";
        if (st === "foreign") foreign.set(client, ALL_CLOCKS);
        else if (st === "claim") claimed.push(client);
      }
      if (foreign.size === 0) return { update, claimed };
      opts.onForeign?.();
      return { update: Y.diffUpdate(update, Y.encodeStateVector(foreign)), claimed };
    };

    /** Record the ids an applied update (or its placeholder) brought in as this peer's. */
    const bind = (claimed: number[]) => {
      for (const client of claimed) {
        if (this.owners.has(client)) continue;
        this.owners.set(client, owner);
        this.seeded.delete(client);
        claims++;
      }
    };

    /** Fill a refused update's new clock ranges with placeholders. `update` holds only
     *  ids this peer may write (see `ownPart`). Returns whether it did. */
    const tombstone = (update: Uint8Array, claimed: number[]): boolean => {
      const state = Y.decodeStateVector(Y.encodeStateVector(this.doc));
      const ranges = newRanges(update, state);
      // Each range must continue the id's clock exactly: a placeholder after a gap would
      // wait in the doc, and could later let parked content in unchecked.
      if (ranges.some((r) => r.clock !== (state.get(r.client) ?? 0))) return false;
      if (ranges.length > 0) Y.applyUpdate(this.doc, tombstoneUpdate(ranges), key);
      bind(claimed.filter((c) => ranges.some((r) => r.client === c)));
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
            const own = ownPart(data);
            if (this.audience!.admit && !this.audience!.admit()) {
              const seen = describeUpdate(own.update, this.doc);
              opts.onDrop?.("full", { tombstoned: tombstone(own.update, own.claimed), ...seen });
              return;
            }
            if (!this.gate!.check(own.update)) {
              // out-of-scope or out-of-bounds write → never applied or broadcast
              const seen = describeUpdate(own.update, this.doc);
              const fieldFull = this.gate!.lastRefusal === "cap";
              opts.onDrop?.("scope", { tombstoned: tombstone(own.update, own.claimed), fieldFull, ...seen });
              return;
            }
            this.gate!.apply(own.update, key);
            bind(own.claimed);
            opts.onAccept?.();
            return;
          }
          if (this.audience) this.trust(data);
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
