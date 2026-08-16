import { describe, expect, test } from "bun:test";
import { type PendingEvent, acknowledge, claim, nextLeaseExpiry, selectAvailable } from "./lanes";

function pending(id: string, seq: number, leaseUntil = 0): PendingEvent {
  return { event: { id, type: "apply" }, leaseUntil, seq };
}

describe("lease selection", () => {
  test("FIFO among available", () => {
    const list = [pending("b", 2), pending("a", 1)];
    expect(selectAvailable(list, 100)!.event.id).toBe("a");
  });

  test("a live lease hides the entry; expiry redelivers", () => {
    const list = [pending("a", 1)];
    const entry = selectAvailable(list, 100)!;
    claim(entry, 50, 100);
    expect(selectAvailable(list, 120)).toBeNull(); // inside lease window
    expect(selectAvailable(list, 151)!.event.id).toBe("a"); // redelivered
  });

  test("no double-delivery inside a lease window with two pollers", () => {
    const list = [pending("a", 1)];
    const first = selectAvailable(list, 100)!;
    claim(first, 30_000, 100);
    expect(selectAvailable(list, 101)).toBeNull();
  });

  test("acknowledge removes exactly the id", () => {
    const list = [pending("a", 1), pending("b", 2)];
    expect(acknowledge(list, "a")!.id).toBe("a");
    expect(acknowledge(list, "a")).toBeNull();
    expect(list.map((e) => e.event.id)).toEqual(["b"]);
  });

  test("nextLeaseExpiry reports the soonest future expiry only", () => {
    const list = [pending("a", 1, 200), pending("b", 2, 150), pending("c", 3, 0)];
    expect(nextLeaseExpiry(list, 100)).toBe(150);
    expect(nextLeaseExpiry(list, 300)).toBeNull();
  });
});
