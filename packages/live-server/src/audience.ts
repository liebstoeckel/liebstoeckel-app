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
 * Counts connections, not people: a viewer with the link open in two tabs counts twice,
 * and so does a phone while its old connection has not timed out yet.
 */
export class AudienceCounter {
  private count = 0;
  private max = 0;
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

  join(): void {
    this.count++;
    if (this.count > this.max) this.max = this.count;
    this.schedule();
  }

  leave(): void {
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
