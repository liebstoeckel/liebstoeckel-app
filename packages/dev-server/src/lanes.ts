// Pending-event bookkeeping for the agent poll loop. Delivering an event
// leases it (stamps `leaseUntil`) rather than removing it, so a crashed agent's
// work is redelivered after the lease expires instead of being lost. Pure:
// callers own the array and the clock.

export interface PollEvent {
  id: string;
  type: string;
  [key: string]: unknown;
}

export interface PendingEvent<T extends PollEvent = PollEvent> {
  event: T;
  /** 0 = unleased; otherwise the epoch-ms until which this delivery is claimed. */
  leaseUntil: number;
  seq: number;
}

/** First unleased (or lease-expired) entry in arrival order, or null. */
export function selectAvailable<T extends PollEvent>(
  pending: Array<PendingEvent<T>>,
  now: number,
): PendingEvent<T> | null {
  return (
    pending
      .filter((entry) => entry.leaseUntil <= now)
      .sort((a, b) => a.seq - b.seq)[0] ?? null
  );
}

/** Claim an entry for `leaseMs`. Mutates the entry (the caller owns the array). */
export function claim<T extends PollEvent>(entry: PendingEvent<T>, leaseMs: number, now: number): T {
  entry.leaseUntil = now + leaseMs;
  return entry.event;
}

/** Remove the pending entry for `id`; returns the event or null when unknown. */
export function acknowledge<T extends PollEvent>(pending: Array<PendingEvent<T>>, id: string): T | null {
  const idx = pending.findIndex((entry) => entry.event.id === id);
  if (idx === -1) return null;
  return pending.splice(idx, 1)[0]!.event;
}

/** Epoch-ms of the soonest future lease expiry, or null when nothing is leased.
 *  Drives the server's redelivery timer. */
export function nextLeaseExpiry(pending: Array<PendingEvent>, now: number): number | null {
  const future = pending.map((entry) => entry.leaseUntil).filter((until) => until > now);
  return future.length ? Math.min(...future) : null;
}
