import { schema, t, type Infer } from "@liebstoeckel/plugin-sdk";

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

/** The vote count as the room reads it: "1 vote", "3 votes". */
export const votesLabel = (n: number): string => `${n} ${n === 1 ? "vote" : "votes"}`;

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

/** When a viewer sees the results: `"always"` (the default), or `"after-vote"`, which
 *  keeps the bars off a viewer's screen until they have voted (or voting is closed).
 *  A display choice, not a secret: the votes still reach every device in the session,
 *  and the presenter's screen (what the room sees projected) always shows them. */
export type ResultsMode = "always" | "after-vote";

export const resultsMode = (value: unknown): ResultsMode => (value === "after-vote" ? "after-vote" : "always");

export function resultsVisible(opts: { mode: ResultsMode; role: string; voted: boolean; closed: boolean }): boolean {
  return opts.mode === "always" || opts.role === "presenter" || opts.voted || opts.closed;
}

/** The line under the options that tells this person where their vote stands, or null
 *  for none. "Received" only while the connection is up: a vote made offline is kept
 *  and sent later, so until then it says "sending". */
export interface VoteStatus {
  state: "received" | "sending" | "closed";
  text: string;
}

export function voteStatus(opts: {
  mine: string | undefined;
  closed: boolean;
  synced: boolean;
  connected: boolean;
  refused: boolean;
}): VoteStatus | null {
  const { mine, closed, synced, connected, refused } = opts;
  if (!synced || refused) return null;
  if (closed) return { state: "closed", text: mine ? `Voting is closed. Your vote: ${mine}.` : "Voting is closed." };
  if (!mine) return null;
  if (!connected) return { state: "sending", text: `Sending your vote: ${mine}…` };
  return { state: "received", text: `Vote received: ${mine}. Tap another option to change it.` };
}
