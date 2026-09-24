// Holds a set of leases: acquires what is free or expired, renews what it
// holds, and says when it lost one, either because someone else holds it now
// or because it could not renew in time. The second case is judged on our own
// monotonic clock, so a dead API connection is noticed without the API: a
// timer per held lease fires when its valid window ends, independent of any
// request that may still be hanging.

import { type LeaseRecord, type Observation, decide, nextRecord, releasedRecord } from "./decide.ts";
import type { LeaseApi } from "./lease-api.ts";

export type LossReason = "taken" | "expired" | "released";

export interface LeaseHolderOptions {
  api: LeaseApi;
  /** Unique per process, e.g. `${podName}_${random}`: a restarted pod must
   *  not pass for its previous incarnation (see `holderIdentity`). */
  identity: string;
  /** The leases this holder may hold. */
  names: string[];
  /** Whether to take a lease it does not hold (free, expired, or new); asked each
   *  pass. Held leases are always renewed. Default: take every one. A holder that
   *  should hold only its share of a set (several pods) answers from that share. */
  wants?: (name: string) => boolean;
  durationSeconds?: number;
  renewEveryMs?: number;
  /** Consider a lease lost this long before it could expire for others. */
  marginMs?: number;
  /** Monotonic milliseconds (default performance.now). */
  now?: () => number;
  wallNow?: () => Date;
  onAcquired?: (name: string, epoch: number) => void | Promise<void>;
  onLost?: (name: string, reason: LossReason) => void | Promise<void>;
  onError?: (name: string, err: unknown) => void;
}

interface Held {
  epoch: number;
  record: LeaseRecord;
  /** Monotonic time of the last successful write of this lease. */
  lastRenewMs: number;
}

export class LeaseHolder {
  private readonly held = new Map<string, Held>();
  private readonly expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly seen = new Map<string, Observation>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;
  private stopped = false;
  private readonly durationSeconds: number;
  private readonly renewEveryMs: number;
  private readonly marginMs: number;
  private readonly now: () => number;
  private readonly wallNow: () => Date;

  constructor(private readonly opts: LeaseHolderOptions) {
    this.durationSeconds = opts.durationSeconds ?? 15;
    this.renewEveryMs = opts.renewEveryMs ?? 5000;
    this.marginMs = opts.marginMs ?? 3000;
    if (this.renewEveryMs * 2 >= this.durationSeconds * 1000 - this.marginMs) {
      throw new Error("renew interval must fit at least twice into the lease duration minus the margin");
    }
    this.now = opts.now ?? (() => performance.now());
    this.wallNow = opts.wallNow ?? (() => new Date());
  }

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.renewEveryMs);
  }

  /** The epoch of a lease we hold and may still act on, or null. */
  epochOf(name: string): number | null {
    const h = this.held.get(name);
    if (!h) return null;
    return this.now() - h.lastRenewMs < this.validForMs() ? h.epoch : null;
  }

  heldNames(): string[] {
    return [...this.held.keys()].filter((n) => this.epochOf(n) !== null);
  }

  private validForMs(): number {
    return this.durationSeconds * 1000 - this.marginMs;
  }

  /** One pass over all leases. Serialized: a slow pass is not overlapped,
   *  but expiry is still checked while one is running. */
  tick(): Promise<void> {
    for (const name of [...this.held.keys()]) void this.checkExpired(name);
    if (this.running) return this.running;
    this.running = this.pass().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** The leases are handled concurrently, so one hanging request does not
   *  delay the others. */
  private async pass(): Promise<void> {
    await Promise.all(
      this.opts.names.map(async (name) => {
        if (this.stopped) return;
        try {
          await this.step(name);
        } catch (err) {
          this.opts.onError?.(name, err);
        }
        await this.checkExpired(name);
      }),
    );
  }

  private drop(name: string): void {
    this.held.delete(name);
    clearTimeout(this.expiryTimers.get(name));
    this.expiryTimers.delete(name);
  }

  private armExpiry(name: string, lastRenewMs: number): void {
    clearTimeout(this.expiryTimers.get(name));
    const timer = setTimeout(() => void this.checkExpired(name), Math.max(0, lastRenewMs + this.validForMs() - this.now()));
    timer.unref?.();
    this.expiryTimers.set(name, timer);
  }

  private async step(name: string): Promise<void> {
    const record = await this.opts.api.get(name);
    const t = this.now();
    if (record) {
      const prev = this.seen.get(name);
      if (!prev || prev.resourceVersion !== record.resourceVersion) {
        this.seen.set(name, { resourceVersion: record.resourceVersion, sinceMs: t });
      }
    }
    const mine = this.held.get(name);
    if (mine && record && record.holder !== this.opts.identity) {
      this.drop(name);
      await this.opts.onLost?.(name, "taken");
    }
    const action = decide(record, this.opts.identity, this.seen.get(name), t, this.held.has(name));
    if (action.kind === "wait") return;
    if (action.kind !== "renew" && this.opts.wants && !this.opts.wants(name)) return;
    const next = nextRecord(record, name, this.opts.identity, action, this.durationSeconds, this.wallNow());
    const written = action.kind === "create" ? await this.opts.api.create(next) : await this.opts.api.update(next);
    if (written === "conflict") {
      // Someone else wrote first; re-read on the next pass.
      if (this.held.has(name)) {
        this.drop(name);
        await this.opts.onLost?.(name, "taken");
      }
      return;
    }
    this.seen.set(name, { resourceVersion: written.resourceVersion, sinceMs: this.now() });
    // A write that only landed after the valid window is not a hold we may act
    // on; the loss was (or is about to be) reported, and the next pass takes
    // the lease over with a new epoch.
    if (this.now() - t >= this.validForMs()) return;
    const was = this.held.get(name);
    this.held.set(name, { epoch: written.transitions, record: written, lastRenewMs: t });
    this.armExpiry(name, t);
    if (!was) await this.opts.onAcquired?.(name, written.transitions);
  }

  private async checkExpired(name: string): Promise<void> {
    const h = this.held.get(name);
    if (h && this.now() - h.lastRenewMs >= this.validForMs()) {
      this.drop(name);
      await this.opts.onLost?.(name, "expired");
    }
  }

  /** Give a lease up after `flush` (write final state), so the next holder
   *  need not wait for it to expire. */
  async release(name: string, flush?: () => Promise<void>): Promise<void> {
    // Never interleave with a renewal of the same lease: a renewal landing after the
    // release would hold the lease again, with nobody renewing it.
    while (this.running) await this.running;
    const h = this.held.get(name);
    if (!h) return;
    if (flush) await flush();
    this.drop(name);
    try {
      await this.opts.api.update(releasedRecord(h.record, this.wallNow()));
    } catch (err) {
      this.opts.onError?.(name, err);
    }
    await this.opts.onLost?.(name, "released");
  }

  /** Stop renewing and release everything held, flushing each first. */
  async stop(flush?: (name: string) => Promise<void>): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.running;
    for (const name of [...this.held.keys()]) await this.release(name, flush ? () => flush(name) : undefined);
  }
}

/** A lease identity unique to this process: the pod name plus a random part. */
export function holderIdentity(podName = process.env.POD_NAME ?? process.env.HOSTNAME ?? "local"): string {
  return `${podName}_${crypto.randomUUID().slice(0, 8)}`;
}
