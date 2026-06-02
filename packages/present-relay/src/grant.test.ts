import { describe, expect, test } from "bun:test";
import { mintGrant, verifyGrant, type Grant } from "./grant";

const SECRET = "relay-control-shared-secret";
const base: Grant = { session: "sess123", role: "audience", scopes: ["interact"], exp: 10_000 };

describe("grant mint/verify", () => {
  test("round-trips a valid grant before expiry", () => {
    const tok = mintGrant(base, SECRET);
    expect(verifyGrant(tok, SECRET, 9_000)).toEqual(base);
  });

  test("rejects an expired grant", () => {
    const tok = mintGrant(base, SECRET);
    expect(verifyGrant(tok, SECRET, 10_000)).toBeNull(); // exp <= now
    expect(verifyGrant(tok, SECRET, 20_000)).toBeNull();
  });

  test("rejects the wrong secret", () => {
    const tok = mintGrant(base, SECRET);
    expect(verifyGrant(tok, "not-the-secret", 9_000)).toBeNull();
  });

  test("rejects a tampered payload (role escalation)", () => {
    const tok = mintGrant(base, SECRET);
    const [, mac] = tok.split(".");
    const forged = Buffer.from(JSON.stringify({ ...base, role: "presenter" }), "utf8").toString("base64url");
    expect(verifyGrant(`${forged}.${mac}`, SECRET, 9_000)).toBeNull();
  });

  test("rejects a tampered signature", () => {
    const tok = mintGrant(base, SECRET);
    const [payload] = tok.split(".");
    expect(verifyGrant(`${payload}.AAAA`, SECRET, 9_000)).toBeNull();
  });

  test("rejects malformed / empty tokens", () => {
    for (const t of [null, undefined, "", "nodot", ".", "a.", ".b", "a.b.c"]) {
      expect(verifyGrant(t, SECRET, 9_000)).toBeNull();
    }
  });

  test("a presenter grant and an audience grant differ by role only", () => {
    const pres = verifyGrant(mintGrant({ ...base, role: "presenter" }, SECRET), SECRET, 9_000);
    const aud = verifyGrant(mintGrant(base, SECRET), SECRET, 9_000);
    expect(pres?.role).toBe("presenter");
    expect(aud?.role).toBe("audience");
  });
});
