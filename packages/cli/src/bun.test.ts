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
});
