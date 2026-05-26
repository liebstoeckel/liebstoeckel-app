import { test, expect, describe } from "bun:test";
import * as Y from "yjs";
import { pluginState } from "@present-it/plugin-sdk";
import { reactionsSchema, EMOJI, recent, expired, allowEmit, overCapIds, type ReactionsState } from "./logic";

const make = (over: Partial<ReactionsState> = {}): ReactionsState => ({
  reactions: {},
  ...over,
});

const burst = (emoji: string, ts: number, pid = "p1") => ({ emoji, pid, ts });

describe("EMOJI", () => {
  test("is a small, non-empty palette", () => {
    expect(EMOJI.length).toBeGreaterThan(0);
    expect(EMOJI.length).toBeLessThanOrEqual(8);
    expect(new Set(EMOJI).size).toBe(EMOJI.length); // unique
  });
});

describe("recent", () => {
  test("keeps entries inside the window, sorted by ts", () => {
    const now = 10_000;
    const s = make({
      reactions: { a: burst("👏", now - 100), b: burst("🔥", now - 3000), c: burst("❤️", now - 5000) },
    });
    const r = recent(s, now); // default 4000ms window → drops c
    expect(r.map((x) => x.id)).toEqual(["b", "a"]); // older first
  });
  test("respects a custom window", () => {
    const now = 10_000;
    const s = make({ reactions: { a: burst("👏", now - 1500) } });
    expect(recent(s, now, 1000)).toHaveLength(0);
    expect(recent(s, now, 2000)).toHaveLength(1);
  });
  test("includes an entry exactly on the window boundary", () => {
    const now = 10_000;
    const s = make({ reactions: { a: burst("👏", now - 4000) } });
    expect(recent(s, now)).toHaveLength(1);
  });
});

describe("expired", () => {
  test("returns ids older than the window", () => {
    const now = 10_000;
    const s = make({
      reactions: { a: burst("👏", now - 100), b: burst("🔥", now - 9000) },
    });
    expect(expired(s, now)).toEqual(["b"]);
  });
  test("boundary entry is not expired", () => {
    const now = 10_000;
    const s = make({ reactions: { a: burst("👏", now - 4000) } });
    expect(expired(s, now)).toEqual([]);
  });
});

describe("allowEmit", () => {
  test("blocks within the min interval, allows after", () => {
    expect(allowEmit(1000, 1100)).toBe(false); // 100ms < 250ms
    expect(allowEmit(1000, 1250)).toBe(true); // exactly the interval
    expect(allowEmit(1000, 1400)).toBe(true);
  });
  test("respects a custom interval", () => {
    expect(allowEmit(0, 500, 1000)).toBe(false);
    expect(allowEmit(0, 1000, 1000)).toBe(true);
  });
});

describe("overCapIds", () => {
  test("returns the oldest ids beyond the cap", () => {
    const reactions: ReactionsState["reactions"] = {};
    for (let i = 0; i < 5; i++) reactions[`r${i}`] = burst("👏", i);
    const s = make({ reactions });
    expect(overCapIds(s, 3)).toEqual(["r0", "r1"]); // 2 oldest dropped
  });
  test("returns nothing when at or under the cap", () => {
    const s = make({ reactions: { a: burst("👏", 1), b: burst("🔥", 2) } });
    expect(overCapIds(s, 3)).toEqual([]);
    expect(overCapIds(s, 2)).toEqual([]);
  });
});

describe("reactions over shared Yjs state (Hub convergence)", () => {
  const sync = (a: Y.Doc, b: Y.Doc) => {
    a.on("update", (u: Uint8Array, origin: unknown) => {
      if (origin !== b) Y.applyUpdate(b, u, a);
    });
    b.on("update", (u: Uint8Array, origin: unknown) => {
      if (origin !== a) Y.applyUpdate(a, u, b);
    });
  };

  test("emit on one doc appears in recent() on the other; prune converges", () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    sync(docA, docB);

    const a = pluginState(docA, "reactions", reactionsSchema);
    const b = pluginState(docB, "reactions", reactionsSchema);

    const now = 100_000;
    const id = "react-1";
    a.recordSet("reactions", id, { emoji: "🎉", pid: "pa", ts: now });

    // B sees the burst within the window.
    const onB = recent(b.snapshot(), now);
    expect(onB).toHaveLength(1);
    expect(onB[0]!.emoji).toBe("🎉");

    // Pruning on A (recordDelete) converges to B.
    a.recordDelete("reactions", id);
    expect(recent(b.snapshot(), now)).toHaveLength(0);
    expect(b.snapshot().reactions[id]).toBeUndefined();
  });
});
