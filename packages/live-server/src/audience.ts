/** How long a live server waits between two audience counts it sends presenters. A
 *  join storm then costs each presenter about one small message a second, not one per
 *  joining phone. */
export const AUDIENCE_NOTICE_MS = 1_000;

/**
 * Counts the audience connections of one live session, keeps the largest count seen
 * (the session's peak audience), and tells presenters the count: at once for the first
 * change after a quiet second, then at most once per `everyMs`, always ending on the
 * latest number. A count that is back where the last message left it sends nothing.
 *
 * Counts connections, not people: a viewer with the link open in two tabs counts twice.
 * A connection that names who it is (`key`, the relay's owner of a viewer's writes)
 * counts once with every other connection of that key: a page that opens two sockets
 * (decks built before 0.4 do), or a phone back on a new connection while its old one has
 * not timed out yet, is one in the count and one against the cap.
 */
export class AudienceCounter {
  private count = 0;
  private max = 0;
  private readonly keys = new Map<string, number>();
  private sent: number | undefined;
  private sentAt = -Infinity;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly announce: (n: number) => void,
    private readonly everyMs = AUDIENCE_NOTICE_MS,
    private readonly now: () => number = Date.now,
  ) {}

  /** Audience connections open right now. */
  get n(): number {
    return this.count;
  }

  /** The most audience connections open at once since the counter started. */
  get peak(): number {
    return this.max;
  }

  /** Whether a connection of this key is counted already (and so takes no new place). */
  has(key: string | undefined): boolean {
    return key !== undefined && this.keys.has(key);
  }

  join(key?: string): void {
    if (key !== undefined) {
      const n = this.keys.get(key) ?? 0;
      this.keys.set(key, n + 1);
      if (n > 0) return;
    }
    this.count++;
    if (this.count > this.max) this.max = this.count;
    this.schedule();
  }

  leave(key?: string): void {
    if (key !== undefined) {
      const n = this.keys.get(key);
      if (!n) return;
      if (n > 1) {
        this.keys.set(key, n - 1);
        return;
      }
      this.keys.delete(key);
    }
    if (this.count === 0) return;
    this.count--;
    this.schedule();
  }

  /** Stop sending (the session is going away). */
  destroy(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(): void {
    if (this.timer) return;
    const wait = this.sentAt + this.everyMs - this.now();
    if (wait <= 0) return this.flush();
    this.timer = setTimeout(() => this.flush(), wait);
    (this.timer as { unref?: () => void }).unref?.();
  }

  private flush(): void {
    this.timer = undefined;
    if (this.count === this.sent) return;
    this.sent = this.count;
    this.sentAt = this.now();
    this.announce(this.count);
  }
}
