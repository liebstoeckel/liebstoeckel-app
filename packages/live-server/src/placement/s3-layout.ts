// Write-once state in object storage, fenced by epoch. An owner writes only
// under its own epoch and never overwrites; a new owner reads the highest
// earlier epoch and writes under its own. Whatever a stale owner still writes
// under its old epoch is never read again. Pure: callers do the listing.

export interface StateKey {
  prefix: string;
  org: string;
  id: string;
  epoch: number;
  seq: number;
  ext: string;
}

const SEGMENT = /^[A-Za-z0-9_-]{1,80}$/;
const EXT = /^[a-z0-9.]{1,20}$/;

/** `<prefix>/<org>/<id>/<epoch>/<seq>.<ext>`, zero-padded so keys sort. */
export function stateKey(k: StateKey): string {
  for (const [name, v] of [
    ["prefix", k.prefix],
    ["org", k.org],
    ["id", k.id],
  ] as const) {
    if (!SEGMENT.test(v)) throw new Error(`unsafe ${name} in a state key: ${v}`);
  }
  if (!EXT.test(k.ext)) throw new Error(`unsafe extension in a state key: ${k.ext}`);
  if (!Number.isSafeInteger(k.epoch) || k.epoch < 0) throw new Error(`bad epoch: ${k.epoch}`);
  if (!Number.isSafeInteger(k.seq) || k.seq < 0) throw new Error(`bad seq: ${k.seq}`);
  return `${k.prefix}/${k.org}/${k.id}/${pad(k.epoch)}/${pad(k.seq)}.${k.ext}`;
}

/** The prefix all epochs of one object share (for listing). */
export function objectPrefix(prefix: string, org: string, id: string): string {
  return `${prefix}/${org}/${id}/`;
}

export function parseStateKey(key: string): StateKey | null {
  const m = key.match(/^([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/(\d{12})\/(\d{12})\.([a-z0-9.]+)$/);
  if (!m) return null;
  return { prefix: m[1]!, org: m[2]!, id: m[3]!, epoch: Number(m[4]), seq: Number(m[5]), ext: m[6]! };
}

const pad = (n: number) => String(n).padStart(12, "0");

/** The state to load when taking over at `epoch`: every key of the highest
 *  earlier epoch that has any, in write order. Empty when there is none. */
export function stateToLoad(keys: Iterable<string>, epoch: number): StateKey[] {
  const byEpoch = new Map<number, StateKey[]>();
  for (const key of keys) {
    const k = parseStateKey(key);
    if (!k || k.epoch >= epoch) continue;
    let list = byEpoch.get(k.epoch);
    if (!list) byEpoch.set(k.epoch, (list = []));
    list.push(k);
  }
  if (byEpoch.size === 0) return [];
  const latest = Math.max(...byEpoch.keys());
  return byEpoch.get(latest)!.sort((a, b) => a.seq - b.seq);
}

/** Keys of epochs that can go: everything older than the `keep` highest
 *  epochs present (the current one included). Never the current epoch. */
export function keysToDelete(keys: Iterable<string>, currentEpoch: number, keep = 2): string[] {
  const parsed: Array<{ key: string; epoch: number }> = [];
  for (const key of keys) {
    const k = parseStateKey(key);
    if (k) parsed.push({ key, epoch: k.epoch });
  }
  const epochs = [...new Set(parsed.map((p) => p.epoch))].sort((a, b) => b - a);
  const kept = new Set(epochs.slice(0, Math.max(1, keep)));
  kept.add(currentEpoch);
  return parsed.filter((p) => !kept.has(p.epoch)).map((p) => p.key);
}
