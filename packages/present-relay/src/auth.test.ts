import { test, expect, describe } from "bun:test";
import { safeEqual, matchAccount, bearer } from "./auth";

describe("auth", () => {
  test("safeEqual matches equal strings, rejects differing/length-mismatch", () => {
    expect(safeEqual("abc123", "abc123")).toBe(true);
    expect(safeEqual("abc123", "abc124")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });

  test("matchAccount returns the matching token or null", () => {
    const tokens = ["tok-a", "tok-b", "tok-c"];
    expect(matchAccount(tokens, "tok-b")).toBe("tok-b");
    expect(matchAccount(tokens, "tok-x")).toBeNull();
    expect(matchAccount(tokens, null)).toBeNull();
    expect(matchAccount(tokens, "")).toBeNull();
  });

  test("bearer parses the Authorization header", () => {
    const mk = (h?: string) => new Request("http://x", h ? { headers: { authorization: h } } : undefined);
    expect(bearer(mk("Bearer abc.def"))).toBe("abc.def");
    expect(bearer(mk("bearer xyz"))).toBe("xyz");
    expect(bearer(mk("Basic abc"))).toBeNull();
    expect(bearer(mk())).toBeNull();
  });
});
