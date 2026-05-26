import { test, expect, describe } from "bun:test";
import * as Y from "yjs";
import { detectLive } from "./detect";
import { getParticipantId } from "./participant";
import { mergeUi } from "./ui";
import { getDeckIndex, setDeckIndex } from "./deckIndex";

describe("detectLive", () => {
  test("reads the injected global, null otherwise", () => {
    const g = globalThis as { __LIEBSTOECKEL_LIVE__?: unknown };
    expect(detectLive()).toBeNull();
    g.__LIEBSTOECKEL_LIVE__ = { ws: "ws://x/sync?t=1", session: "s", role: "viewer", token: "1" };
    expect(detectLive()?.role).toBe("viewer");
    delete g.__LIEBSTOECKEL_LIVE__;
  });
});

describe("getParticipantId", () => {
  test("generates once and persists in storage", () => {
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    const a = getParticipantId(store);
    const b = getParticipantId(store);
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(10);
  });
});

describe("mergeUi", () => {
  const A = () => null;
  const B = () => null;
  test("overrides win, others kept", () => {
    expect(mergeUi({ Bar: A, Row: A }, { Bar: B })).toEqual({ Bar: B, Row: A });
    expect(mergeUi({ Bar: A })).toEqual({ Bar: A });
  });
});

describe("deck index over shared doc", () => {
  test("propagates presenter→viewer", () => {
    const pres = new Y.Doc();
    const view = new Y.Doc();
    setDeckIndex(pres, 3);
    Y.applyUpdate(view, Y.encodeStateAsUpdate(pres));
    expect(getDeckIndex(view)).toBe(3);
    expect(getDeckIndex(new Y.Doc())).toBe(0); // default
  });
});
