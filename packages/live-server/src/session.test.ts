import { test, expect, describe } from "bun:test";
import { createSession, roleForToken, buildLinks } from "./session";

describe("session", () => {
  test("creates distinct tokens", () => {
    let n = 0;
    const s = createSession(() => `tok${n++}`);
    expect(s.presenterToken).not.toBe(s.viewerToken);
    expect(s.id.length).toBeGreaterThan(0);
  });

  test("roleForToken maps tokens to roles, denies unknown", () => {
    const s = createSession();
    expect(roleForToken(s, s.presenterToken)).toBe("presenter");
    expect(roleForToken(s, s.viewerToken)).toBe("viewer");
    expect(roleForToken(s, "nope")).toBeNull();
    expect(roleForToken(s, undefined)).toBeNull();
    expect(roleForToken(s, "")).toBeNull();
  });

  test("real tokens are random hex of decent length", () => {
    const s = createSession();
    expect(s.presenterToken).toMatch(/^[0-9a-f]{32}$/);
  });

  test("buildLinks embeds tokens and normalizes base", () => {
    const s = createSession(() => "abc");
    const links = buildLinks("http://host:1234/", s);
    expect(links.presenter).toBe("http://host:1234/?t=abc");
    expect(links.viewer).toBe("http://host:1234/?t=abc");
  });
});
