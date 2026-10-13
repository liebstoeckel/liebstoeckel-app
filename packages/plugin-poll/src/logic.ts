import { schema, t, type Infer } from "@liebstoeckel/plugin-sdk";
import { defineMessages, type Locale } from "@liebstoeckel/plugin-sdk/messages";
import type { Refusal } from "@liebstoeckel/plugin-sdk";

/** What the poll says to the room, in English and German. The German never addresses
 *  the reader, so it fits a meeting and a conference alike. */
export const pollMessages = defineMessages({
  en: {
    livePoll: "Live poll",
    connecting: "connecting…",
    votes: (n: number) => `${n} ${n === 1 ? "vote" : "votes"}`,
    closed: "Voting is closed.",
    closedMine: (choice: string) => `Voting is closed. Your vote: ${choice}.`,
    sending: (choice: string) => `Sending your vote: ${choice}…`,
    received: (choice: string) => `Vote received: ${choice}. Tap another option to change it.`,
    resultsAfterVote: "Results appear after you vote.",
    refused: (reason: Refusal["reason"]) =>
      reason === "busy"
        ? "Your vote didn't reach the presenter. The live server is busy, try again in a moment."
        : reason === "full"
          ? "Your vote didn't reach the presenter: the session is full."
          : "Your vote didn't reach the presenter.",
  },
  de: {
    livePoll: "Live-Umfrage",
    connecting: "Verbindung wird aufgebaut…",
    votes: (n: number) => `${n} ${n === 1 ? "Stimme" : "Stimmen"}`,
    closed: "Die Abstimmung ist beendet.",
    closedMine: (choice: string) => `Die Abstimmung ist beendet. Gewählt: ${choice}.`,
    sending: (choice: string) => `Stimme wird gesendet: ${choice}…`,
    received: (choice: string) => `Stimme angekommen: ${choice}. Zum Ändern eine andere Option antippen.`,
    resultsAfterVote: "Die Ergebnisse erscheinen nach der Stimmabgabe.",
    refused: (reason: Refusal["reason"]) =>
      reason === "busy"
        ? "Die Stimme ist nicht angekommen. Der Live-Server ist ausgelastet, gleich noch einmal versuchen."
        : reason === "full"
          ? "Die Stimme ist nicht angekommen: die Sitzung ist voll."
          : "Die Stimme ist nicht angekommen.",
  },
});

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

/** The vote count as the room reads it: "1 vote", "3 votes" ("1 Stimme" in German). */
export const votesLabel = (n: number, locale?: Locale): string => pollMessages(locale).votes(n);

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
  locale?: Locale;
}): VoteStatus | null {
  const { mine, closed, synced, connected, refused } = opts;
  const m = pollMessages(opts.locale);
  if (!synced || refused) return null;
  if (closed) return { state: "closed", text: mine ? m.closedMine(mine) : m.closed };
  if (!mine) return null;
  if (!connected) return { state: "sending", text: m.sending(mine) };
  return { state: "received", text: m.received(mine) };
}
