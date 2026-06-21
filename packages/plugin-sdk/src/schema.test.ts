import { test, expect, describe } from "bun:test";
import { t, schema } from "./schema";

describe("schema primitives", () => {
  test("string parses & rejects", () => {
    expect(t.string.parse("hi")).toBe("hi");
    expect(t.string.safeParse(5)).toEqual({ ok: false, error: "expected string" });
    expect(t.string.default()).toBe("");
  });
  test("number rejects NaN/non-finite", () => {
    expect(t.number.parse(3)).toBe(3);
    expect(t.number.safeParse(NaN).ok).toBe(false);
    expect(t.number.safeParse("3").ok).toBe(false);
  });
  test("boolean", () => {
    expect(t.boolean.parse(true)).toBe(true);
    expect(t.boolean.safeParse(0).ok).toBe(false);
  });
});

describe("containers", () => {
  test("array validates items", () => {
    const s = t.array(t.string);
    expect(s.parse(["a", "b"])).toEqual(["a", "b"]);
    expect(s.safeParse(["a", 1]).ok).toBe(false);
    expect(s.safeParse("nope").ok).toBe(false);
    expect(s.default()).toEqual([]);
  });
  test("record validates values, rejects arrays", () => {
    const s = t.record(t.number);
    expect(s.parse({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    expect(s.safeParse({ a: "x" }).ok).toBe(false);
    expect(s.safeParse([]).ok).toBe(false);
    expect(s.default()).toEqual({});
  });
});

describe("object/schema", () => {
  const poll = schema({ options: t.array(t.string), votes: t.record(t.string) });
  test("default shape", () => {
    expect(poll.default()).toEqual({ options: [], votes: {} });
  });
  test("parses nested", () => {
    expect(poll.parse({ options: ["A", "B"], votes: { p1: "A" } })).toEqual({
      options: ["A", "B"],
      votes: { p1: "A" },
    });
  });
  test("rejects bad nested field", () => {
    expect(poll.safeParse({ options: [1], votes: {} }).ok).toBe(false);
    expect(poll.safeParse(null).ok).toBe(false);
  });
});

describe("sanitize (untrusted remote state)", () => {
  test("primitive falls back to default when invalid", () => {
    expect(t.string.sanitize(42)).toBe("");
    expect(t.string.sanitize("ok")).toBe("ok");
    expect(t.number.sanitize(NaN)).toBe(0);
    expect(t.boolean.sanitize("yes")).toBe(false);
  });

  test("array drops invalid items, keeps good ones", () => {
    expect(t.array(t.string).sanitize(["a", 1, "b", null])).toEqual(["a", "b"]);
    expect(t.array(t.string).sanitize("not an array")).toEqual([]);
  });

  test("record drops invalid entries, keeps good ones", () => {
    expect(t.record(t.number).sanitize({ a: 1, b: "x", c: 3 })).toEqual({ a: 1, c: 3 });
  });

  test("record of objects drops a type-confused entry (the render-crash guard)", () => {
    // A Q&A-shaped record: an entry whose `text` is an object must be dropped so it can
    // never reach React as an invalid child and crash the deck; valid entries survive.
    const questions = t.record(t.object({ text: t.string, author: t.string, ts: t.number }));
    const out = questions.sanitize({
      good: { text: "hi", author: "anon", ts: 1 },
      evil: { text: { x: 1 }, author: "anon", ts: 2 },
    });
    expect(out).toEqual({ good: { text: "hi", author: "anon", ts: 1 } });
  });

  test("object coerces each field independently and drops unknown keys", () => {
    const poll = schema({ question: t.string, closed: t.boolean });
    expect(poll.sanitize({ question: 5, closed: true, extra: "drop me" })).toEqual({
      question: "",
      closed: true,
    });
    expect(poll.sanitize(null)).toEqual({ question: "", closed: false });
  });
});
