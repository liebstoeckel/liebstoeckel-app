// A live session's state in object storage, fenced by the session's epoch: every
// (re)placement by the control plane gets a higher epoch, and the relay writes only
// under its own. Keys are write-once, `live/<org>/<session>/<epoch>/<seq>.<ext>`:
//
//   <seq>.snap  the whole Yjs document
//   <seq>.log   the document updates since the previous key (flushed every ~1.5 s)
//   <seq>.end   written by the control plane when the session ends (no state)
//   <seq>.own   which audience client owns which Yjs client id (JSON): the whole map
//               before each snapshot, what was added before each log
//
// A new owner reads the highest earlier epoch that holds state: its latest snapshot
// and the logs after it, and every `.own` key of that epoch. An owner that finds any key under a higher epoch has been
// replaced (or the session ended) and stops without writing. Imports only Yjs and the
// placement layout, so the control plane can read results with `latestState`.

import { keysToDelete, objectPrefix, parseStateKey, stateKey, type StateKey } from "@liebstoeckel/live-server/placement";
import * as Y from "yjs";

export const STATE_PREFIX = "live";
const SNAP = "snap";
const LOG = "log";
const OWN = "own";
export const END = "end";

/** Who owns which Yjs client id: client id -> an opaque owner key. */
export type Owners = Array<[number, string]>;

/** The owners in one `.own` key; nothing for a key that does not parse. */
function decodeOwners(bytes: Uint8Array): Owners {
  try {
    const body = JSON.parse(new TextDecoder().decode(bytes)) as { v?: unknown; owners?: unknown };
    if (body.v !== 1 || !Array.isArray(body.owners)) return [];
    return body.owners.filter(
      (e): e is [number, string] =>
        Array.isArray(e) && Number.isSafeInteger(e[0]) && e[0] >= 0 && typeof e[1] === "string" && e[1].length <= 64,
    );
  } catch {
    return [];
  }
}

const encodeOwners = (owners: Owners): Uint8Array => new TextEncoder().encode(JSON.stringify({ v: 1, owners }));

/** Every owner recorded in the `.own` keys of the epoch `picked` comes from. An owner
 *  never changes, so the union of all of them is the map. */
async function readOwners(storage: StateStorage, keys: StateKey[], picked: StateKey[]): Promise<Owners> {
  if (picked.length === 0) return [];
  const epoch = picked[0]!.epoch;
  const out = new Map<number, string>();
  for (const k of keys.filter((k) => k.epoch === epoch && k.ext === OWN).sort((a, b) => a.seq - b.seq)) {
    // gone (pruned meanwhile): a later key holds the whole map
    const bytes = await storage.get(stateKey(k));
    if (bytes) for (const [client, owner] of decodeOwners(bytes)) if (!out.has(client)) out.set(client, owner);
  }
  return [...out];
}

/** What the state layer needs from object storage. */
export interface StateStorage {
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, bytes: Uint8Array): Promise<void>;
  list(prefix: string): Promise<string[]>;
  delete(key: string): Promise<void>;
}

/** A key named by the listing was gone when read (pruned meanwhile). */
class MissingObject extends Error {}

/** The keys of one session, parsed. */
async function sessionKeys(storage: StateStorage, org: string, session: string): Promise<StateKey[]> {
  const keys = await storage.list(objectPrefix(STATE_PREFIX, org, session));
  return keys.map(parseStateKey).filter((k): k is StateKey => k !== null);
}

/** The state keys to read from the highest epoch below `before` that holds state:
 *  its latest snapshot and every log after it, in write order. */
function pickState(keys: StateKey[], before: number): StateKey[] {
  const epochs = keys.filter((k) => k.epoch < before && (k.ext === SNAP || k.ext === LOG)).map((k) => k.epoch);
  if (epochs.length === 0) return [];
  const epoch = Math.max(...epochs);
  const own = keys.filter((k) => k.epoch === epoch && (k.ext === SNAP || k.ext === LOG)).sort((a, b) => a.seq - b.seq);
  let lastSnap = -1;
  for (let i = 0; i < own.length; i++) if (own[i]!.ext === SNAP) lastSnap = i;
  return lastSnap < 0 ? own : own.slice(lastSnap);
}

async function readMerged(storage: StateStorage, picked: StateKey[]): Promise<Uint8Array | null> {
  if (picked.length === 0) return null;
  const parts: Uint8Array[] = [];
  for (const k of picked) {
    const bytes = await storage.get(stateKey(k));
    if (!bytes) throw new MissingObject(stateKey(k));
    parts.push(bytes);
  }
  return parts.length === 1 ? parts[0]! : Y.mergeUpdates(parts);
}

/** The latest stored state of a session as one Yjs update, whatever epoch wrote it
 *  (results after a talk). Null when nothing was stored. */
export async function latestState(storage: StateStorage, org: string, session: string): Promise<Uint8Array | null> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await readMerged(storage, pickState(await sessionKeys(storage, org, session), Number.MAX_SAFE_INTEGER));
    } catch (err) {
      if (err instanceof MissingObject && attempt < 3) continue;
      throw err;
    }
  }
}

/** Mark a session ended under `epoch` (higher than any owner's), so an owner that
 *  was not reached directly stops at its next fence check. */
export async function markEnded(storage: StateStorage, org: string, session: string, epoch: number): Promise<void> {
  await storage.put(stateKey({ prefix: STATE_PREFIX, org, id: session, epoch, seq: 1, ext: END }), new Uint8Array(0));
}

export type FenceResult = "owner" | "replaced" | "ended";

export interface SessionStateOptions {
  storage: StateStorage;
  org: string;
  session: string;
  epoch: number;
  /** Snapshots kept in the current epoch; older snapshots and their logs go. */
  keepSnapshots?: number;
}

/** One session's writer. Not safe for two concurrent writers of the same epoch,
 *  which the control plane never creates. */
export class SessionState {
  private seq = 0;
  private pending: Uint8Array[] = [];
  /** Owners recorded since the last write of them. */
  private newOwners: Owners = [];
  private written: Array<{ seq: number; ext: string }> = [];
  private stopped = false;

  private constructor(private readonly opts: SessionStateOptions) {}

  get epoch(): number {
    return this.opts.epoch;
  }

  /** Open a session's state at `epoch`: returns the state to seed from (null: none),
   *  or "stale" when a higher epoch already exists (this placement lost a race). */
  static async open(
    opts: SessionStateOptions,
  ): Promise<{ state: SessionState; seed: Uint8Array | null; owners: Owners } | "stale"> {
    for (let attempt = 1; ; attempt++) {
      try {
        const keys = await sessionKeys(opts.storage, opts.org, opts.session);
        if (keys.some((k) => k.epoch >= opts.epoch)) return "stale";
        const picked = pickState(keys, opts.epoch);
        const seed = await readMerged(opts.storage, picked);
        const owners = await readOwners(opts.storage, keys, picked);
        const state = new SessionState(opts);
        void state.dropOldEpochs(keys.map((k) => stateKey(k)));
        return { state, seed, owners };
      } catch (err) {
        if (err instanceof MissingObject && attempt < 3) continue;
        throw err;
      }
    }
  }

  /** Record a document update for the next log flush. */
  note(update: Uint8Array): void {
    if (!this.stopped) this.pending.push(update);
  }

  /** Record that `owner` brought Yjs client id `client` in, for the next write. */
  noteOwner(client: number, owner: string): void {
    if (!this.stopped) this.newOwners.push([client, owner]);
  }

  /** Write the updates noted since the last flush as one log key. The owners recorded
   *  meanwhile go first: an owner without its content does no harm, content whose owner
   *  is not stored would be refused to that owner after a move. */
  async flushLog(): Promise<void> {
    if (this.stopped) return;
    await this.flushOwners();
    if (this.pending.length === 0) return;
    const batch = this.pending;
    this.pending = [];
    try {
      await this.write(LOG, batch.length === 1 ? batch[0]! : Y.mergeUpdates(batch));
    } catch (err) {
      this.pending = [...batch, ...this.pending];
      throw err;
    }
  }

  private async flushOwners(): Promise<void> {
    if (this.newOwners.length === 0) return;
    const batch = this.newOwners;
    this.newOwners = [];
    try {
      await this.write(OWN, encodeOwners(batch));
    } catch (err) {
      this.newOwners = [...batch, ...this.newOwners];
      throw err;
    }
  }

  /** Write the whole document (and the whole owner map, before it); then the keys
   *  before the previous snapshot are no longer needed by a load and are deleted. */
  async snapshot(doc: Uint8Array, owners?: Owners): Promise<void> {
    if (this.stopped) return;
    // Everything noted so far is in `doc` and in `owners`.
    this.pending = [];
    if (owners) {
      this.newOwners = [];
      try {
        if (owners.length > 0) await this.write(OWN, encodeOwners(owners));
      } catch (err) {
        // the next log flush writes them instead
        this.newOwners = [...owners, ...this.newOwners];
        throw err;
      }
    }
    await this.write(SNAP, doc);
    const snaps = this.written.filter((w) => w.ext === SNAP);
    const keep = this.opts.keepSnapshots ?? 2;
    if (snaps.length > keep) {
      const oldestKept = snaps[snaps.length - keep]!.seq;
      const drop = this.written.filter((w) => w.seq < oldestKept);
      this.written = this.written.filter((w) => w.seq >= oldestKept);
      for (const w of drop) await this.opts.storage.delete(this.key(w)).catch(() => undefined);
    }
  }

  /** Whether this process still owns the session: no key under a higher epoch.
   *  A replaced owner stops writing at once, another pod owns the state now. An
   *  ended one may still write its final snapshot under its own epoch (the caller
   *  does, then stops), so changes made since the last log flush are not lost. */
  async fence(): Promise<FenceResult> {
    const keys = await sessionKeys(this.opts.storage, this.opts.org, this.opts.session);
    const higher = keys.filter((k) => k.epoch > this.opts.epoch);
    if (higher.length === 0) return "owner";
    if (higher.some((k) => k.ext === END) && !higher.some((k) => k.ext === SNAP || k.ext === LOG)) return "ended";
    this.stopped = true;
    return "replaced";
  }

  /** Stop writing for good (replaced, ended or dropped without a final write). */
  stop(): void {
    this.stopped = true;
    this.pending = [];
    this.newOwners = [];
  }

  private key(w: { seq: number; ext: string }): string {
    const { org, session, epoch } = this.opts;
    return stateKey({ prefix: STATE_PREFIX, org, id: session, epoch, seq: w.seq, ext: w.ext });
  }

  private async write(ext: string, bytes: Uint8Array): Promise<void> {
    const w = { seq: ++this.seq, ext };
    await this.opts.storage.put(this.key(w), bytes);
    this.written.push(w);
  }

  /** Epochs older than the two newest belong to owners long gone. */
  private async dropOldEpochs(keys: string[]): Promise<void> {
    for (const key of keysToDelete(keys, this.opts.epoch, 2)) {
      if (this.stopped) return;
      await this.opts.storage.delete(key).catch(() => undefined);
    }
  }
}
