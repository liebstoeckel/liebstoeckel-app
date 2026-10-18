import { describe, expect, test } from "bun:test";
import { followsPresenterCookie, stampedEngine } from "./presenter-cookie";

const deck = (meta: string) => `<!doctype html>\n<html><head>\n    ${meta}\n<title>t</title></head><body></body></html>`;

describe("stampedEngine", () => {
  test("reads the engine version from the generator stamp", () => {
    expect(stampedEngine(deck('<meta name="generator" content="liebstoeckel engine 0.3.10, cli 0.3.12" />'))).toEqual([0, 3, 10]);
    expect(stampedEngine(deck('<meta name="generator" content="liebstoeckel engine 0.4.0" />'))).toEqual([0, 4, 0]);
  });

  test("null without a stamp, or with a stamp that is not liebstoeckel's", () => {
    expect(stampedEngine(deck(""))).toBeNull();
    expect(stampedEngine(deck('<meta name="generator" content="Hugo 0.120" />'))).toBeNull();
  });

  test("only the head counts: a stamp-like string in the body is ignored", () => {
    const html = `<html><head><title>t</title></head><body>&lt;meta name="generator" content="liebstoeckel engine 9.9.9"&gt;<meta name="generator" content="liebstoeckel engine 9.9.9"></body></html>`;
    expect(stampedEngine(html)).toBeNull();
  });
});

describe("followsPresenterCookie", () => {
  test("0.4.0 and later take the cookie exchange", () => {
    for (const v of ["0.4.0", "0.4.1", "0.10.0", "1.0.0"]) {
      expect(followsPresenterCookie(deck(`<meta name="generator" content="liebstoeckel engine ${v}" />`))).toBe(true);
    }
  });

  test("older engines and unstamped decks keep t in the address", () => {
    for (const v of ["0.3.10", "0.3.99", "0.0.0"]) {
      expect(followsPresenterCookie(deck(`<meta name="generator" content="liebstoeckel engine ${v}" />`))).toBe(false);
    }
    expect(followsPresenterCookie(deck(""))).toBe(false);
  });
});
