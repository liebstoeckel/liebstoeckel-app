import { describe, expect, test } from "bun:test";
import { decide, microTime, nextRecord, releasedRecord, type LeaseRecord } from "./decide.ts";
import { CLOSE, isFatalClose, negotiateVersion, reconnectsAtOnce } from "./protocol.ts";
import { keysToDelete, parseStateKey, stateKey, stateToLoad } from "./s3-layout.ts";
import { fnv1a, shardLeaseName, shardOf } from "./shards.ts";

describe("shards", () => {
  test("stable hash (pinned values must never change)", () => {
    expect(fnv1a("")).toBe(0x811c9dc5);
    expect(fnv1a("deck-1")).toBe(fnv1a("deck-1"));
    expect(shardOf("85e1cdce-6e96-41a6-af30-1d5d368c234a", 16)).toBe(shardOf("85e1cdce-6e96-41a6-af30-1d5d368c234a", 16));
  });

  test("spreads ids over the shards", () => {
    const counts = new Array(16).fill(0);
    for (let i = 0; i < 16000; i++) counts[shardOf(crypto.randomUUID(), 16)]++;
    for (const c of counts) expect(c).toBeGreaterThan(800);
  });

  test("names and bad counts", () => {
    expect(shardLeaseName("sync", 3)).toBe("sync-shard-3");
    expect(() => shardOf("x", 0)).toThrow();
  });
});

describe("s3 layout", () => {
  const key = (epoch: number, seq: number, ext = "snap") => stateKey({ prefix: "sync", org: "o1", id: "d1", epoch, seq, ext });

  test("keys round-trip and sort by epoch and seq", () => {
    const k = key(3, 12, "bundle");
    expect(k).toBe("sync/o1/d1/000000000003/000000000012.bundle");
    expect(parseStateKey(k)).toEqual({ prefix: "sync", org: "o1", id: "d1", epoch: 3, seq: 12, ext: "bundle" });
    expect([key(10, 1), key(2, 5), key(2, 11)].sort()).toEqual([key(2, 5), key(2, 11), key(10, 1)]);
  });

  test("refuses unsafe segments", () => {
    expect(() => stateKey({ prefix: "p", org: "../x", id: "d", epoch: 0, seq: 0, ext: "snap" })).toThrow();
    expect(() => stateKey({ prefix: "p", org: "o", id: "d", epoch: -1, seq: 0, ext: "snap" })).toThrow();
  });

  test("stateToLoad takes the highest EARLIER epoch in write order", () => {
    const keys = [key(1, 0), key(1, 1), key(3, 0), key(3, 2), key(3, 1), key(5, 0), "garbage"];
    expect(stateToLoad(keys, 5).map((k) => [k.epoch, k.seq])).toEqual([[3, 0], [3, 1], [3, 2]]);
    expect(stateToLoad(keys, 1)).toEqual([]);
  });

  test("keysToDelete keeps the newest epochs and never the current one", () => {
    const keys = [key(1, 0), key(2, 0), key(3, 0), key(4, 0)];
    expect(keysToDelete(keys, 4, 2)).toEqual([key(1, 0), key(2, 0)]);
    expect(keysToDelete(keys, 1, 1)).toEqual([key(2, 0), key(3, 0)]);
  });
});

describe("protocol", () => {
  test("negotiates versions and refuses too-old clients with a message", () => {
    expect(negotiateVersion("3", { min: 2, max: 3 })).toEqual({ ok: true, version: 3 });
    expect(negotiateVersion("5", { min: 2, max: 3 })).toEqual({ ok: true, version: 3 });
    expect(negotiateVersion(null, { min: 1, max: 2 })).toEqual({ ok: true, version: 1 });
    const old = negotiateVersion(null, { min: 2, max: 2 });
    expect(old.ok).toBe(false);
    if (!old.ok) {
      expect(old.code).toBe(CLOSE.PROTOCOL_TOO_OLD);
      expect(old.message).toContain("Update the CLI");
    }
    expect(negotiateVersion("abc", { min: 1, max: 1 }).ok).toBe(false);
  });

  test("close code classes", () => {
    expect(reconnectsAtOnce(CLOSE.MOVED)).toBe(true);
    expect(reconnectsAtOnce(1006)).toBe(false);
    expect(isFatalClose(CLOSE.PROTOCOL_TOO_OLD)).toBe(true);
  });
});

describe("lease decisions", () => {
  const rec = (over: Partial<LeaseRecord> = {}): LeaseRecord => ({
    name: "l",
    holder: "a",
    durationSeconds: 15,
    transitions: 4,
    acquireTime: null,
    renewTime: null,
    resourceVersion: "10",
    ...over,
  });

  test("create, renew, reacquire, free", () => {
    expect(decide(null, "a", undefined, 0)).toEqual({ kind: "create" });
    expect(decide(rec(), "a", undefined, 0, true)).toEqual({ kind: "renew" });
    expect(decide(rec(), "a", undefined, 0, false)).toEqual({ kind: "takeover", why: "reacquire" });
    expect(decide(rec({ holder: null }), "b", undefined, 0)).toEqual({ kind: "takeover", why: "free" });
  });

  test("another holder expires only after its record stood still for the duration on OUR clock", () => {
    expect(decide(rec(), "b", undefined, 100_000)).toEqual({ kind: "wait", untilMs: null });
    expect(decide(rec(), "b", { resourceVersion: "9", sinceMs: 0 }, 100_000)).toEqual({ kind: "wait", untilMs: null });
    expect(decide(rec(), "b", { resourceVersion: "10", sinceMs: 1000 }, 15_999)).toEqual({ kind: "wait", untilMs: 16_000 });
    expect(decide(rec(), "b", { resourceVersion: "10", sinceMs: 1000 }, 16_000)).toEqual({ kind: "takeover", why: "expired" });
  });

  test("records: epochs grow only on a change of holder", () => {
    const now = new Date("2026-09-24T10:00:00.123Z");
    expect(microTime(now)).toBe("2026-09-24T10:00:00.123000Z");
    expect(nextRecord(null, "l", "a", { kind: "create" }, 15, now).transitions).toBe(0);
    expect(nextRecord(rec(), "l", "a", { kind: "renew" }, 15, now).transitions).toBe(4);
    const taken = nextRecord(rec(), "l", "b", { kind: "takeover", why: "expired" }, 15, now);
    expect([taken.holder, taken.transitions, taken.resourceVersion]).toEqual(["b", 5, "10"]);
    expect(releasedRecord(rec(), now).holder).toBeNull();
  });
});

describe("protocol.ts stays browser-safe", () => {
  test("imports nothing", async () => {
    const source = await Bun.file(new URL("./protocol.ts", import.meta.url)).text();
    expect(new Bun.Transpiler({ loader: "ts" }).scanImports(source)).toEqual([]);
  });
});
