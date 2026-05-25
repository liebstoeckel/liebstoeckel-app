import { schema, t, type Infer } from "@present-it/plugin-sdk";

// Shared state: the question's options + one vote per participant (keyed by id).
export const pollSchema = schema({
  question: t.string,
  options: t.array(t.string),
  votes: t.record(t.string), // participantId -> chosen option
  closed: t.boolean,
});
export type PollState = Infer<typeof pollSchema>;

export interface TallyRow {
  option: string;
  count: number;
  pct: number;
}

/** Pure derivation: votes → per-option counts + percentages. */
export function tally(state: PollState): TallyRow[] {
  const rows: TallyRow[] = state.options.map((option) => ({ option, count: 0, pct: 0 }));
  const index = new Map(state.options.map((o, i) => [o, i]));
  for (const choice of Object.values(state.votes)) {
    const i = index.get(choice);
    if (i !== undefined) rows[i]!.count++;
  }
  const total = rows.reduce((s, r) => s + r.count, 0);
  for (const r of rows) r.pct = total ? Math.round((r.count / total) * 100) : 0;
  return rows;
}

export const totalVotes = (state: PollState): number =>
  Object.values(state.votes).filter((c) => state.options.includes(c)).length;

/** The option this participant currently has selected, if any. */
export const myVote = (state: PollState, participantId: string): string | undefined =>
  state.votes[participantId];

/** The winning option (or null on a tie / no votes). */
export function leader(state: PollState): string | null {
  const rows = tally(state);
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.count));
  if (max === 0) return null;
  const top = rows.filter((r) => r.count === max);
  return top.length === 1 ? top[0]!.option : null;
}
