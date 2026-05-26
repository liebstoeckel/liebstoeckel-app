import { schema, t, type Infer } from "@present-it/plugin-sdk";

// Ephemeral floating-emoji reactions. Each entry is one reaction "burst", keyed by
// a generated id. Entries are transient — clients prune expired/over-cap ids via
// recordDelete so the doc never accumulates history.
export const reactionsSchema = schema({
  reactions: t.record(t.object({ emoji: t.string, pid: t.string, ts: t.number })),
});
export type ReactionsState = Infer<typeof reactionsSchema>;

/** A small, tasteful palette. */
export const EMOJI: readonly string[] = ["👏", "❤️", "🎉", "🔥", "😮", "💡"];

/** Soft cap on live entries before clients prune the oldest. */
export const MAX_ENTRIES = 60;

export interface Reaction {
  id: string;
  emoji: string;
  pid: string;
  ts: number;
}

const all = (state: ReactionsState): Reaction[] =>
  Object.entries(state.reactions).map(([id, r]) => ({ id, emoji: r.emoji, pid: r.pid, ts: r.ts }));

/** Entries still inside the visible window, oldest → newest. */
export function recent(state: ReactionsState, now: number, windowMs = 4000): Reaction[] {
  return all(state)
    .filter((r) => r.ts >= now - windowMs)
    .sort((a, b) => a.ts - b.ts);
}

/** Ids that have aged out of the window (to prune). */
export function expired(state: ReactionsState, now: number, windowMs = 4000): string[] {
  return all(state)
    .filter((r) => r.ts < now - windowMs)
    .map((r) => r.id);
}

/** Rate-limit predicate: may this participant emit again now? */
export const allowEmit = (lastEmitAt: number, now: number, minIntervalMs = 250): boolean =>
  now - lastEmitAt >= minIntervalMs;

/** Oldest ids beyond the cap, so the live set stays bounded. */
export function overCapIds(state: ReactionsState, max = MAX_ENTRIES): string[] {
  const sorted = all(state).sort((a, b) => a.ts - b.ts);
  if (sorted.length <= max) return [];
  return sorted.slice(0, sorted.length - max).map((r) => r.id);
}
