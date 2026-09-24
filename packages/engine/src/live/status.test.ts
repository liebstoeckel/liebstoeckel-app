import { describe, expect, test } from "bun:test";
import { liveStatusVisible } from "./status";

describe("liveStatusVisible", () => {
  test("presenters see every state but connected", () => {
    for (const status of ["connecting", "reconnecting", "ended", "outdated"] as const) {
      expect(liveStatusVisible({ status }, "presenter")).toBe(true);
    }
    expect(liveStatusVisible({ status: "connected" }, "presenter")).toBe(false);
    expect(liveStatusVisible(undefined, "presenter")).toBe(false);
  });

  test("the audience sees only what does not fix itself", () => {
    expect(liveStatusVisible({ status: "reconnecting" }, "viewer")).toBe(false);
    expect(liveStatusVisible({ status: "connecting" }, "viewer")).toBe(false);
    expect(liveStatusVisible({ status: "ended" }, "viewer")).toBe(true);
    expect(liveStatusVisible({ status: "outdated" }, "viewer")).toBe(true);
  });
});
