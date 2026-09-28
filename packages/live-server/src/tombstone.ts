import * as Y from "yjs";

// A Yjs client's updates must apply in clock order: once the relay refuses one of a
// peer's updates, every later update from the same client waits for the missing
// clocks and never applies. For a refused write that a resync cannot fix (it touched
// a field the audience may not write), the relay instead applies a *tombstone*: an
// update that fills the refused clock range with garbage-collected placeholders. It
// carries no content and no deletions, so nothing of the refused write is applied or
// broadcast, but the client's clock moves past it and its later writes apply again.

/** A clock range `[clock, clock + length)` of one Yjs client. */
export interface ClockRange {
  client: number;
  clock: number;
  length: number;
}

/** The clock ranges `update` would add to a doc whose state vector is `state`: per
 *  client, from the doc's current clock (or the update's first clock, if later) up to
 *  the update's last clock. Clients the doc already has in full are left out. Throws
 *  on a malformed update. */
export function newRanges(update: Uint8Array, state: Map<number, number>): ClockRange[] {
  const { from, to } = Y.parseUpdateMeta(update);
  const out: ClockRange[] = [];
  for (const [client, end] of to) {
    const start = Math.max(from.get(client) ?? 0, state.get(client) ?? 0);
    if (end > start) out.push({ client, clock: start, length: end - start });
  }
  return out;
}

function writeVarUint(out: number[], n: number): void {
  while (n > 0x7f) {
    out.push(0x80 | (n & 0x7f));
    n = Math.floor(n / 128);
  }
  out.push(n);
}

/** Encode a Yjs (v1) update holding one garbage-collected placeholder per range and
 *  an empty delete set. The layout is Yjs's own: the number of clients, then per
 *  client the struct count, the client id and the first clock, then each struct (a GC
 *  struct is info byte 0 and its length), then the delete set (no clients). */
export function tombstoneUpdate(ranges: readonly ClockRange[]): Uint8Array {
  const out: number[] = [];
  writeVarUint(out, ranges.length);
  for (const r of ranges) {
    writeVarUint(out, 1);
    writeVarUint(out, r.client);
    writeVarUint(out, r.clock);
    out.push(0);
    writeVarUint(out, r.length);
  }
  writeVarUint(out, 0);
  return new Uint8Array(out);
}
