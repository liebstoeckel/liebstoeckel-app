import { test, expect, describe } from "bun:test";
import * as Y from "yjs";
import { pluginState } from "@liebstoeckel/plugin-sdk";
import { pollSchema, tally, totalVotes, votesLabel, myVote, leader, resultsMode, resultsVisible, voteStatus, type PollState } from "./logic";

const make = (over: Partial<PollState> = {}): PollState => ({
  question: "Q?",
  options: ["A", "B", "C"],
  votes: {},
  closed: false,
  ...over,
});

describe("tally", () => {
  test("counts votes per option with percentages", () => {
    const s = make({ votes: { p1: "A", p2: "A", p3: "B" } });
    expect(tally(s)).toEqual([
      { option: "A", count: 2, pct: 67 },
      { option: "B", count: 1, pct: 33 },
      { option: "C", count: 0, pct: 0 },
    ]);
    expect(totalVotes(s)).toBe(3);
  });
  test("ignores votes for unknown options", () => {
    const s = make({ votes: { p1: "Z", p2: "A" } });
    expect(totalVotes(s)).toBe(1);
    expect(tally(s)[0]).toEqual({ option: "A", count: 1, pct: 100 });
  });
  test("labels the count in the singular for one vote", () => {
    expect(votesLabel(0)).toBe("0 votes");
    expect(votesLabel(1)).toBe("1 vote");
    expect(votesLabel(2)).toBe("2 votes");
  });
  test("empty → zero pcts", () => {
    expect(tally(make()).every((r) => r.pct === 0)).toBe(true);
    expect(leader(make())).toBeNull();
  });
  test("leader picks unique max, null on tie", () => {
    expect(leader(make({ votes: { p1: "A", p2: "A", p3: "B" } }))).toBe("A");
    expect(leader(make({ votes: { p1: "A", p2: "B" } }))).toBeNull();
  });
  test("myVote returns the participant's current choice", () => {
    const s = make({ votes: { p1: "B" } });
    expect(myVote(s, "p1")).toBe("B");
    expect(myVote(s, "p2")).toBeUndefined();
  });
});

describe("poll over shared state (one vote per participant)", () => {
  test("re-voting overwrites; tally reflects live doc", () => {
    const doc = new Y.Doc();
    const st = pluginState(doc, "poll", pollSchema);
    st.ensureDefaults({ question: "Best?", options: ["A", "B"] });
    st.recordSet("votes", "p1", "A");
    st.recordSet("votes", "p2", "B");
    st.recordSet("votes", "p1", "B"); // p1 changes mind
    const snap = st.snapshot();
    expect(totalVotes(snap)).toBe(2);
    expect(tally(snap)).toEqual([
      { option: "A", count: 0, pct: 0 },
      { option: "B", count: 2, pct: 100 },
    ]);
  });
});

describe("voteStatus", () => {
  const base = { mine: "A" as string | undefined, closed: false, synced: true, connected: true, refused: false };
  test("received once cast over a working connection", () => {
    expect(voteStatus(base)).toEqual({ state: "received", text: "Vote received: A. Tap another option to change it." });
  });
  test("sending while the connection is down", () => {
    expect(voteStatus({ ...base, connected: false })).toEqual({ state: "sending", text: "Sending your vote: A…" });
  });
  test("nothing before a vote, before the state arrived, or after a refusal", () => {
    expect(voteStatus({ ...base, mine: undefined })).toBeNull();
    expect(voteStatus({ ...base, synced: false })).toBeNull();
    expect(voteStatus({ ...base, refused: true })).toBeNull();
  });
  test("closed voting says so, with the vote if there is one", () => {
    expect(voteStatus({ ...base, closed: true })?.text).toBe("Voting is closed. Your vote: A.");
    expect(voteStatus({ ...base, closed: true, mine: undefined })?.text).toBe("Voting is closed.");
  });
});

describe("results setting", () => {
  test("unknown values fall back to always", () => {
    expect(resultsMode(undefined)).toBe("always");
    expect(resultsMode("nope")).toBe("always");
    expect(resultsMode("after-vote")).toBe("after-vote");
  });
  test("after-vote: hidden from a viewer until they vote or voting closes; never from the presenter", () => {
    const v = { mode: "after-vote" as const, role: "viewer", voted: false, closed: false };
    expect(resultsVisible(v)).toBe(false);
    expect(resultsVisible({ ...v, voted: true })).toBe(true);
    expect(resultsVisible({ ...v, closed: true })).toBe(true);
    expect(resultsVisible({ ...v, role: "presenter" })).toBe(true);
    expect(resultsVisible({ ...v, mode: "always" })).toBe(true);
  });
});
