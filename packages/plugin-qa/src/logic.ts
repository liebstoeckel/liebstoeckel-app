import { schema, t, type Infer } from "@liebstoeckel/plugin-sdk";

// Shared state. Audience submits questions (keyed by a generated id) and upvotes
// them; the presenter can mark answered / dismiss. Votes are stored top-level keyed
// by a composite `${qid}|${pid}` so concurrent upvotes merge (one-level record API).
export const qaSchema = schema({
  questions: t.record(t.object({ text: t.string, author: t.string, ts: t.number })),
  votes: t.record(t.boolean), // `${qid}|${pid}` -> true (presence = an upvote)
  answered: t.record(t.boolean), // qid -> true
  dismissed: t.record(t.boolean), // qid -> true
});
export type QaState = Infer<typeof qaSchema>;

export interface RankedQuestion {
  id: string;
  text: string;
  author: string;
  ts: number;
  votes: number;
  answered: boolean;
}

/** Composite key for one participant's upvote of one question. */
export const voteKey = (qid: string, pid: string): string => `${qid}|${pid}`;

/** Count of truthy `votes` entries whose key targets this question. */
export function voteCount(state: QaState, qid: string): number {
  const prefix = `${qid}|`;
  let n = 0;
  for (const [key, on] of Object.entries(state.votes)) {
    if (on && key.startsWith(prefix)) n++;
  }
  return n;
}

/** Has this participant upvoted this question? */
export const hasVoted = (state: QaState, qid: string, pid: string): boolean =>
  state.votes[voteKey(qid, pid)] === true;

/**
 * Core derivation: visible questions ranked by votes desc, then ts asc (older
 * first on a tie). Dismissed questions are excluded; answered ones are surfaced
 * via the `answered` flag.
 */
export function rankedQuestions(state: QaState): RankedQuestion[] {
  const rows: RankedQuestion[] = [];
  for (const [id, q] of Object.entries(state.questions)) {
    if (state.dismissed[id]) continue;
    rows.push({
      id,
      text: q.text,
      author: q.author,
      ts: q.ts,
      votes: voteCount(state, id),
      answered: state.answered[id] === true,
    });
  }
  rows.sort((a, b) => (b.votes - a.votes) || (a.ts - b.ts));
  return rows;
}
