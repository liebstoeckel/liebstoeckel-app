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
