import { test, expect, describe } from "bun:test";
import * as Y from "yjs";
import { pluginState } from "@liebstoeckel/plugin-sdk";
import { qaSchema, voteKey, voteCount, hasVoted, rankedQuestions, type QaState } from "./logic";

const make = (over: Partial<QaState> = {}): QaState => ({
  questions: {},
  votes: {},
  answered: {},
  dismissed: {},
  ...over,
});

const q = (text: string, ts: number, author = "anon") => ({ text, author, ts });

describe("voteKey / voteCount / hasVoted", () => {
  test("voteKey is a composite of qid and pid", () => {
    expect(voteKey("q1", "p1")).toBe("q1|p1");
  });
  test("voteCount counts only truthy votes targeting that qid", () => {
    const s = make({
      votes: { "q1|p1": true, "q1|p2": true, "q1|p3": false, "q2|p1": true },
    });
    expect(voteCount(s, "q1")).toBe(2);
    expect(voteCount(s, "q2")).toBe(1);
    expect(voteCount(s, "q3")).toBe(0);
  });
  test("voteCount does not bleed across qid prefixes", () => {
    // "q1" must not match keys for "q10"
    const s = make({ votes: { "q10|p1": true, "q1|p1": true } });
    expect(voteCount(s, "q1")).toBe(1);
    expect(voteCount(s, "q10")).toBe(1);
  });
  test("hasVoted reflects a participant's upvote", () => {
    const s = make({ votes: { "q1|p1": true } });
    expect(hasVoted(s, "q1", "p1")).toBe(true);
    expect(hasVoted(s, "q1", "p2")).toBe(false);
  });
});

describe("rankedQuestions", () => {
  test("sorts by votes desc, then ts asc on a tie", () => {
    const s = make({
      questions: { a: q("A", 100), b: q("B", 50), c: q("C", 200) },
      votes: { "a|p1": true, "a|p2": true, "b|p1": true, "c|p1": true },
    });
    // a:2, b:1@ts50, c:1@ts200 → a, then b (older) before c
    expect(rankedQuestions(s).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
  test("ties broken by older ts first", () => {
    const s = make({ questions: { newer: q("N", 200), older: q("O", 100) } });
    expect(rankedQuestions(s).map((r) => r.id)).toEqual(["older", "newer"]);
  });
  test("excludes dismissed questions", () => {
    const s = make({
      questions: { a: q("A", 1), b: q("B", 2) },
      dismissed: { b: true },
    });
    expect(rankedQuestions(s).map((r) => r.id)).toEqual(["a"]);
  });
  test("surfaces the answered flag without dropping the row", () => {
    const s = make({
      questions: { a: q("A", 1) },
      answered: { a: true },
    });
    const rows = rankedQuestions(s);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.answered).toBe(true);
  });
  test("carries vote counts, text and author through", () => {
    const s = make({
      questions: { a: q("How?", 1, "ada") },
      votes: { "a|p1": true, "a|p2": true },
    });
    expect(rankedQuestions(s)[0]).toEqual({ id: "a", text: "How?", author: "ada", ts: 1, votes: 2, answered: false });
  });
  test("empty state → empty list", () => {
    expect(rankedQuestions(make())).toEqual([]);
  });
});

describe("Q&A over shared Yjs state (Hub convergence)", () => {
  // Sync helper: exchange updates between two docs (origin-guarded to avoid loops).
  const sync = (a: Y.Doc, b: Y.Doc) => {
    a.on("update", (u: Uint8Array, origin: unknown) => {
      if (origin !== b) Y.applyUpdate(b, u, a);
    });
    b.on("update", (u: Uint8Array, origin: unknown) => {
      if (origin !== a) Y.applyUpdate(a, u, b);
    });
  };

  test("one client submits, the other upvotes; rankedQuestions converges", () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    sync(docA, docB);

    const a = pluginState(docA, "qa", qaSchema);
    const b = pluginState(docB, "qa", qaSchema);

    // A submits a question (fixed id for a deterministic assertion).
    const qid = "qid-1";
    a.recordSet("questions", qid, { text: "Why Yjs?", author: "alice", ts: 10 });

    // B sees it and upvotes; A upvotes too.
    expect(b.snapshot().questions[qid]?.text).toBe("Why Yjs?");
    b.recordSet("votes", voteKey(qid, "pb"), true);
    a.recordSet("votes", voteKey(qid, "pa"), true);

    for (const st of [a, b]) {
      const ranked = rankedQuestions(st.snapshot());
      expect(ranked).toHaveLength(1);
      expect(ranked[0]!.id).toBe(qid);
      expect(ranked[0]!.votes).toBe(2);
    }
  });
});
