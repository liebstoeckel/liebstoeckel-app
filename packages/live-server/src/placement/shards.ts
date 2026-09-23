// Mapping objects to a fixed number of shards. The hash must never change:
// it decides which lease, and so which pod, owns an object's state.

/** FNV-1a, 32 bit: stable across runtimes and releases, cheap, well spread. */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function shardOf(id: string, count: number): number {
  if (!Number.isInteger(count) || count < 1) throw new Error(`shard count must be a positive integer: ${count}`);
  return fnv1a(id) % count;
}

/** The lease name of a shard, e.g. `sync-shard-3`. */
export function shardLeaseName(prefix: string, shard: number): string {
  return `${prefix}-shard-${shard}`;
}
