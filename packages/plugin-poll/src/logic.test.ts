import { test, expect, describe } from "bun:test";
import * as Y from "yjs";
import { pluginState } from "@liebstoeckel/plugin-sdk";
import { pollSchema, tally, totalVotes, myVote, leader, type PollState } from "./logic";

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
