// A live session's state in object storage, fenced by the session's epoch: every
// (re)placement by the control plane gets a higher epoch, and the relay writes only
// under its own. Keys are write-once, `live/<org>/<session>/<epoch>/<seq>.<ext>`:
//
//   <seq>.snap  the whole Yjs document
//   <seq>.log   the document updates since the previous key (flushed every ~1.5 s)
//   <seq>.end   written by the control plane when the session ends (no state)
//
// A new owner reads the highest earlier epoch that holds state: its latest snapshot
// and the logs after it. An owner that finds any key under a higher epoch has been
// replaced (or the session ended) and stops without writing. Imports only Yjs and the
// placement layout, so the control plane can read results with `latestState`.

import { keysToDelete, objectPrefix, parseStateKey, stateKey, type StateKey } from "@liebstoeckel/live-server/placement";
import * as Y from "yjs";

export const STATE_PREFIX = "live";
const SNAP = "snap";
const LOG = "log";
export const END = "end";

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
  private written: Array<{ seq: number; ext: string }> = [];
  private stopped = false;

  private constructor(private readonly opts: SessionStateOptions) {}

  get epoch(): number {
    return this.opts.epoch;
  }

  /** Open a session's state at `epoch`: returns the state to seed from (null: none),
   *  or "stale" when a higher epoch already exists (this placement lost a race). */
  static async open(opts: SessionStateOptions): Promise<{ state: SessionState; seed: Uint8Array | null } | "stale"> {
    for (let attempt = 1; ; attempt++) {
      try {
        const keys = await sessionKeys(opts.storage, opts.org, opts.session);
        if (keys.some((k) => k.epoch >= opts.epoch)) return "stale";
        const seed = await readMerged(opts.storage, pickState(keys, opts.epoch));
        const state = new SessionState(opts);
        void state.dropOldEpochs(keys.map((k) => stateKey(k)));
        return { state, seed };
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

  /** Write the updates noted since the last flush as one log key. */
  async flushLog(): Promise<void> {
    if (this.stopped || this.pending.length === 0) return;
    const batch = this.pending;
    this.pending = [];
    try {
      await this.write(LOG, batch.length === 1 ? batch[0]! : Y.mergeUpdates(batch));
    } catch (err) {
      this.pending = [...batch, ...this.pending];
      throw err;
    }
  }

  /** Write the whole document; then the logs and snapshots before the previous
   *  snapshot are no longer needed by a load and are deleted. */
  async snapshot(doc: Uint8Array): Promise<void> {
    if (this.stopped) return;
    // Everything noted so far is in `doc`.
    this.pending = [];
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

  /** Whether this process still owns the session: no key under a higher epoch. */
  async fence(): Promise<FenceResult> {
    const keys = await sessionKeys(this.opts.storage, this.opts.org, this.opts.session);
    const higher = keys.filter((k) => k.epoch > this.opts.epoch);
    if (higher.length === 0) return "owner";
    this.stopped = true;
    return higher.some((k) => k.ext === END) && !higher.some((k) => k.ext === SNAP || k.ext === LOG) ? "ended" : "replaced";
  }

  /** Stop writing for good (replaced, ended or dropped without a final write). */
  stop(): void {
    this.stopped = true;
    this.pending = [];
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
