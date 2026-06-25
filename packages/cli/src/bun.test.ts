import { describe, expect, test } from "bun:test";
import { bunBin, bunVersionError } from "./bun";

describe("bunVersionError", () => {
  test("passes (returns null) when current satisfies the range", () => {
    expect(bunVersionError("1.3.0", ">=1.3", "/x/bun")).toBeNull();
    expect(bunVersionError("1.3.14", ">=1.3", "/x/bun")).toBeNull();
    expect(bunVersionError("2.0.0", ">=1.3", "/x/bun")).toBeNull();
  });

  test("fails (returns message) when current is too old", () => {
    const msg = bunVersionError("1.2.12", ">=1.3", "/usr/local/bun/bin/bun");
    expect(msg).not.toBeNull();
    // names the required range, the actual version, and the binary in play
    expect(msg).toContain(">=1.3");
    expect(msg).toContain("1.2.12");
    expect(msg).toContain("/usr/local/bun/bin/bun");
    expect(msg).toContain("bun upgrade");
  });

  test("the binary in play is the running interpreter, not a bare PATH lookup", () => {
    expect(bunBin).toBe(process.execPath);
  });

  test("accepts prerelease/canary builds judged by their release version", () => {
    // Regression: Bun.semver.satisfies("1.5.0-canary.X", ">=1.3") is false (npm-semver
    // only matches a prerelease against a range pinning the same M.m.p), which wrongly
    // rejects a newer canary/nightly Bun. We strip the prerelease before the check.
    expect(bunVersionError("1.5.0-canary.20240101", ">=1.3", "/x/bun")).toBeNull();
    expect(bunVersionError("1.3.0-canary.1", ">=1.3", "/x/bun")).toBeNull();
    expect(bunVersionError("1.4.0+build.7", ">=1.3", "/x/bun")).toBeNull();
  });

  test("still rejects a too-old prerelease, naming the actual running version", () => {
    const msg = bunVersionError("1.2.0-canary.99", ">=1.3", "/x/bun");
    expect(msg).not.toBeNull();
    expect(msg).toContain("1.2.0-canary.99"); // the real version, not the stripped one
  });

  test("compares minor versions numerically, not lexically (1.10 ≥ 1.3)", () => {
    expect(bunVersionError("1.10.0", ">=1.3", "/x/bun")).toBeNull();
    expect(bunVersionError("1.30.2", ">=1.3", "/x/bun")).toBeNull();
  });
});
