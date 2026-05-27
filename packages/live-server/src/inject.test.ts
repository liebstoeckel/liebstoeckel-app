import { test, expect, describe } from "bun:test";
import { injectBootstrap } from "./inject";

const boot = { ws: "ws://h:1/s", session: "s1", role: "viewer" as const, token: "tok", participant: "p1" };

describe("injectBootstrap", () => {
  test("adds window.__LIEBSTOECKEL_LIVE__ into <head>", () => {
    const out = injectBootstrap("<html><head><title>x</title></head><body></body></html>", boot);
    expect(out).toContain("window.__LIEBSTOECKEL_LIVE__=");
    expect(out).toContain('"role":"viewer"');
    expect(out.indexOf("__LIEBSTOECKEL_LIVE__")).toBeLessThan(out.indexOf("</head>"));
  });

  test("escapes < to keep the inline script well-formed", () => {
    const out = injectBootstrap("<head></head>", { ...boot, token: "</script><b>" });
    expect(out).not.toContain("</script><b>");
    expect(out).toContain("\\u003c");
  });

  test("standalone HTML (no inject) has no live flag — fallback path", () => {
    const plain = "<html><head></head><body></body></html>";
    expect(plain).not.toContain("__LIEBSTOECKEL_LIVE__");
  });
});
