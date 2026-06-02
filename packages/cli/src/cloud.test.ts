import { describe, expect, test } from "bun:test";
import { resolveOrg } from "./cloud";

describe("resolveOrg (ADR 0057)", () => {
  test("explicit --org wins and is stripped from rest", () => {
    const r = resolveOrg(["./dist/index.html", "--org", "acme", "--title", "X"], "stored");
    expect(r.org).toBe("acme");
    expect(r.rest).toEqual(["./dist/index.html", "--title", "X"]);
    // the org value must not leak into rest (else it'd be mistaken for the deck path)
    expect(r.rest).not.toContain("acme");
  });
  test("falls back to the stored default", () => {
    const r = resolveOrg(["./dist/index.html"], "stored");
    expect(r.org).toBe("stored");
    expect(r.rest).toEqual(["./dist/index.html"]);
  });
  test("undefined (personal) when no flag and no default", () => {
    expect(resolveOrg(["x"]).org).toBeUndefined();
  });
});
