import { describe, expect, test } from "bun:test";
import { liveStatusVisible, refusingText } from "./status";

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

  test("everyone sees the sending hint, until the talk ends", () => {
    for (const role of ["viewer", "presenter"]) {
      expect(liveStatusVisible({ status: "reconnecting", sending: true }, role)).toBe(true);
      expect(liveStatusVisible({ status: "connected", sending: true }, role)).toBe(true);
    }
    expect(liveStatusVisible({ status: "ended", sending: true }, "viewer")).toBe(true);
    expect(liveStatusVisible({ status: "connected", sending: undefined }, "viewer")).toBe(false);
  });
});

describe("refusingText (presenter banner)", () => {
  test("plain words per reason, only while connected", () => {
    expect(refusingText({ status: "connected", refusing: "full" })).toContain("this session is full");
    expect(refusingText({ status: "connected", refusing: "busy" })).toContain("the live server is busy");
    expect(refusingText({ status: "connected" })).toBeNull();
    expect(refusingText({ status: "reconnecting", refusing: "full" })).toBeNull();
    expect(refusingText(undefined)).toBeNull();
  });
});
