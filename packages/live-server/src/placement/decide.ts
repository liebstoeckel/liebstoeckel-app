// Pure decisions about one lease: whether to create, renew, take over or wait,
// and the record to write. Expiry is judged the way Kubernetes' own leader
// election does it: a lease held by someone else counts as expired only after
// its record has not changed for the lease duration, measured on OUR clock
// from when we first saw that version. Clock skew between pods cannot cause a
// premature takeover.

export interface LeaseRecord {
  name: string;
  holder: string | null;
  durationSeconds: number;
  /** Counts changes of holder; the epoch of the current holder. */
  transitions: number;
  acquireTime: string | null;
  renewTime: string | null;
  /** Kubernetes optimistic-concurrency token; every write is conditioned on it. */
  resourceVersion: string;
}

/** When we first saw a lease record version, on our monotonic clock. */
export interface Observation {
  resourceVersion: string;
  sinceMs: number;
}

export type LeaseAction =
  | { kind: "create" }
  | { kind: "renew" }
  | { kind: "takeover"; why: "free" | "expired" | "reacquire" | "predecessor" }
  | { kind: "wait"; untilMs: number | null };

/** `iHoldIt`: this process holds the lease already. A record naming us that
 *  this process does not know (a restart under the same identity) is taken
 *  over with a new epoch, never renewed: the old incarnation's state under
 *  the old epoch has to be loaded first. `predecessor`: the holder is known to
 *  be a dead earlier process of ours (the caller decides, e.g. an earlier
 *  process of the same StatefulSet pod), so there is nothing to wait out. */
export function decide(
  record: LeaseRecord | null,
  me: string,
  seen: Observation | undefined,
  nowMs: number,
  iHoldIt = false,
  predecessor = false,
): LeaseAction {
  if (!record) return { kind: "create" };
  if (record.holder === me) return iHoldIt ? { kind: "renew" } : { kind: "takeover", why: "reacquire" };
  if (!record.holder) return { kind: "takeover", why: "free" };
  if (predecessor) return { kind: "takeover", why: "predecessor" };
  if (!seen || seen.resourceVersion !== record.resourceVersion) return { kind: "wait", untilMs: null };
  const expiresAt = seen.sinceMs + record.durationSeconds * 1000;
  return nowMs >= expiresAt ? { kind: "takeover", why: "expired" } : { kind: "wait", untilMs: expiresAt };
}

/** Kubernetes MicroTime: RFC 3339 with microseconds. */
export function microTime(d: Date): string {
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

/** The record to write for an action (resourceVersion carried for the CAS). */
export function nextRecord(
  record: LeaseRecord | null,
  name: string,
  me: string,
  action: Exclude<LeaseAction, { kind: "wait" }>,
  durationSeconds: number,
  wallNow: Date,
): LeaseRecord {
  const now = microTime(wallNow);
  if (action.kind === "create") {
    return { name, holder: me, durationSeconds, transitions: 0, acquireTime: now, renewTime: now, resourceVersion: "" };
  }
  const base = record!;
  if (action.kind === "renew") return { ...base, durationSeconds, renewTime: now };
  return { ...base, holder: me, durationSeconds, transitions: base.transitions + 1, acquireTime: now, renewTime: now };
}

/** The record that gives a lease up, so the next holder need not wait. */
export function releasedRecord(record: LeaseRecord, wallNow: Date): LeaseRecord {
  return { ...record, holder: null, durationSeconds: 1, renewTime: microTime(wallNow) };
}
