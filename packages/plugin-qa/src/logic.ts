import { schema, t, type Infer } from "@liebstoeckel/plugin-sdk";
import { defineMessages, type Locale } from "@liebstoeckel/plugin-sdk/messages";
import type { Refusal } from "@liebstoeckel/plugin-sdk";

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
  // One pass over the upvotes for all questions: counting per question would walk every
  // upvote once per question, which a phone feels in a long Q&A.
  const counts = new Map<string, number>();
  for (const [key, on] of Object.entries(state.votes)) {
    if (!on) continue;
    const bar = key.indexOf("|");
    if (bar < 0) continue;
    const qid = key.slice(0, bar);
    counts.set(qid, (counts.get(qid) ?? 0) + 1);
  }
  const rows: RankedQuestion[] = [];
  for (const [id, q] of Object.entries(state.questions)) {
    if (state.dismissed[id]) continue;
    rows.push({
      id,
      text: q.text,
      author: q.author,
      ts: q.ts,
      votes: counts.get(id) ?? 0,
      answered: state.answered[id] === true,
    });
  }
  rows.sort((a, b) => (b.votes - a.votes) || (a.ts - b.ts));
  return rows;
}

/** What the Q&A says to the room, in English and German. The German never addresses
 *  the reader, so it fits a meeting and a conference alike. */
export const qaMessages = defineMessages({
  en: {
    audienceQa: "Audience Q&A",
    open: (n: number) => `${n} open`,
    prompt: "Ask a question",
    askTheRoom: "Ask the room",
    placeholder: "Type your question…",
    inputLabel: "Your question",
    ask: "Ask",
    connecting: "Connecting…",
    empty: "No questions yet, be the first.",
    anonymous: "anonymous",
    answered: "answered",
    upvote: (text: string, n: number) => `Upvote: ${text} (${n})`,
    kept: (years: number | null, days: number) =>
      `Your question may be saved by the presenter's organisation for up to ${
        years !== null ? (years === 1 ? "a year" : `${years} years`) : days === 1 ? "a day" : `${days} days`
      }.`,
    refused: (what: "question" | "upvote", reason: Refusal["reason"]) =>
      reason === "busy"
        ? `Your ${what} didn't reach the presenter. The live server is busy, try again in a moment.`
        : reason === "full"
          ? `Your ${what} didn't reach the presenter: the session is full.`
          : `Your ${what} didn't reach the presenter.`,
  },
  de: {
    audienceQa: "Fragen aus dem Publikum",
    open: (n: number) => `${n} offen`,
    prompt: "Eine Frage stellen",
    askTheRoom: "Fragen an den Vortrag",
    placeholder: "Frage eingeben…",
    inputLabel: "Frage",
    ask: "Senden",
    connecting: "Verbindung wird aufgebaut…",
    empty: "Noch keine Fragen.",
    anonymous: "anonym",
    answered: "beantwortet",
    upvote: (text: string, n: number) => `Unterstützen: ${text} (${n})`,
    kept: (years: number | null, days: number) =>
      `Die Frage kann von der Organisation der vortragenden Person bis zu ${
        years !== null ? (years === 1 ? "einem Jahr" : `${years} Jahren`) : days === 1 ? "einem Tag" : `${days} Tagen`
      } gespeichert werden.`,
    refused: (what: "question" | "upvote", reason: Refusal["reason"]) => {
      const thing = what === "question" ? "Die Frage" : "Die Unterstützung";
      return reason === "busy"
        ? `${thing} ist nicht angekommen. Der Live-Server ist ausgelastet, gleich noch einmal versuchen.`
        : reason === "full"
          ? `${thing} ist nicht angekommen: die Sitzung ist voll.`
          : `${thing} ist nicht angekommen.`;
    },
  },
});

/** The line shown above the ask box when the hosting session keeps what the audience
 *  writes, so a viewer knows before they send. Null when nothing is kept. */
export function keptHint(days: number | undefined, locale?: Locale): string | null {
  if (!days || days <= 0) return null;
  const years = days / 365;
  return qaMessages(locale).kept(Number.isInteger(years) ? years : null, days);
}

/** A question this viewer sent and has not yet seen in the shared state. */
export interface SentQuestion {
  text: string;
  ts: number;
}

/** Whether a sent question was refused: a refusal came in after it was sent, and the
 *  shared state lacks it. The page's own copy holds the question as soon as it is sent,
 *  so its presence proves nothing until the server's state replaces that copy after the
 *  refusal; until then (or without a refusal) it stays `pending`. */
export function sentQuestionFate(sent: SentQuestion, state: QaState, refusalAt: number | undefined): "refused" | "pending" {
  if (refusalAt === undefined || refusalAt < sent.ts) return "pending";
  for (const q of Object.values(state.questions)) {
    if (q.ts === sent.ts && q.text === sent.text) return "pending";
  }
  return "refused";
}
