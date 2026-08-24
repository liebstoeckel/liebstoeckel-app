import { describe, expect, test } from "bun:test";
import {
  type AnnotationEntry,
  assignRequestIndices,
  emptyStore,
  entriesByStatus,
  entriesInBatch,
  parseStore,
  rebaseRequestsAfterInsert,
  serializeStore,
  setStatus,
  upsertEntry,
} from "./store";

function entry(id: string, overrides: Partial<AnnotationEntry> = {}): AnnotationEntry {
  return {
    id,
    slide: { index: 0, sourceFile: "slides/01-title.mdx" },
    comments: [{ x: 0.5, y: 0.5, text: "bigger title" }],
    strokes: [],
    screenshot: null,
    status: "open",
    batchId: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("store transitions", () => {
  test("upsert then list by status and slide", () => {
    let store = emptyStore();
    store = upsertEntry(store, entry("a"));
    store = upsertEntry(store, entry("b", { slide: { index: 2, sourceFile: null }, createdAt: 2 }));
    expect(entriesByStatus(store, "open").map((e) => e.id)).toEqual(["a", "b"]);
    expect(entriesByStatus(store, "open", 2).map((e) => e.id)).toEqual(["b"]);
    expect(entriesByStatus(store, "applied")).toEqual([]);
  });

  test("dispatch stamps the batch, reopen clears it", () => {
    let store = upsertEntry(emptyStore(), entry("a"));
    store = setStatus(store, ["a"], "dispatched", { batchId: "batch1", now: 5 });
    expect(store.entries.a!.status).toBe("dispatched");
    expect(store.entries.a!.batchId).toBe("batch1");
    expect(store.entries.a!.updatedAt).toBe(5);
    expect(entriesInBatch(store, "batch1").map((e) => e.id)).toEqual(["a"]);
    store = setStatus(store, ["a"], "open", { now: 6 });
    expect(store.entries.a!.batchId).toBeNull();
  });

  test("applied keeps the batch id for revert lookup", () => {
    let store = upsertEntry(emptyStore(), entry("a"));
    store = setStatus(store, ["a"], "dispatched", { batchId: "b1" });
    store = setStatus(store, ["a"], "applied");
    expect(store.entries.a!.batchId).toBe("b1");
  });

  test("unknown ids are ignored", () => {
    const store = setStatus(upsertEntry(emptyStore(), entry("a")), ["nope"], "applied");
    expect(store.entries.a!.status).toBe("open");
  });
});

describe("parse tolerance", () => {
  test("junk, wrong version, malformed entries", () => {
    expect(parseStore("not json").entries).toEqual({});
    expect(parseStore('{"version":2,"entries":{}}').entries).toEqual({});
    const mixed = parseStore(
      JSON.stringify({
        version: 1,
        entries: {
          good: entry("good"),
          idMismatch: entry("other"),
          badStatus: { ...entry("badStatus"), status: "wat" },
          junk: 42,
        },
      }),
    );
    expect(Object.keys(mixed.entries)).toEqual(["good"]);
  });

  test("coordinate space: absent means viewport (v1 entries), stage is kept", () => {
    const mixed = parseStore(JSON.stringify({ version: 1, entries: { v1: entry("v1"), v2: { ...entry("v2"), space: "stage" }, bad: { ...entry("bad"), space: "window" } } }));
    expect("space" in mixed.entries.v1!).toBe(false);
    expect(mixed.entries.v2!.space).toBe("stage");
    expect("space" in mixed.entries.bad!).toBe(false);
    expect(parseStore(serializeStore(mixed))).toEqual(mixed);
  });

  test("round-trip preserves entries", () => {
    const store = upsertEntry(emptyStore(), entry("a", { screenshot: "a.png" }));
    expect(parseStore(serializeStore(store))).toEqual(store);
  });
});

describe("kinds", () => {
  test("absent kind is annotate; add-slide keeps its request; unknown kinds are dropped", () => {
    const parsed = parseStore(
      JSON.stringify({
        version: 1,
        entries: {
          a: entry("a"),
          q: { ...entry("q"), kind: "add-slide", request: { after: 1, description: "a chart" }, slide: { index: 2, sourceFile: null } },
          r: { ...entry("r"), kind: "move-slide", request: { after: 0, description: "" } },
          x: { ...entry("x"), kind: "explode" },
        },
      }),
    );
    expect("kind" in parsed.entries.a!).toBe(false);
    expect(parsed.entries.q!.kind).toBe("add-slide");
    expect(parsed.entries.q!.request).toEqual({ after: 1, description: "a chart" });
    expect(parsed.entries.r!.kind).toBe("move-slide");
    expect(parsed.entries.x).toBeUndefined();
    expect(parseStore(serializeStore(parsed))).toEqual(parsed);
  });
});

describe("slide request indices", () => {
  const request = (id: string, after: number, overrides: Partial<AnnotationEntry> = {}) =>
    entry(id, { kind: "add-slide", request: { after, description: id }, slide: { index: -1, sourceFile: null }, comments: [], ...overrides });
  const indices = (store: ReturnType<typeof emptyStore>) =>
    Object.fromEntries(Object.values(store.entries).map((e) => [e.id, e.slide.index]));

  test("same position: consecutive in creation order; different positions: each counts the inserts before it", () => {
    let store = emptyStore();
    store = upsertEntry(store, request("a", 1, { createdAt: 1 }));
    store = upsertEntry(store, request("b", 1, { createdAt: 2 }));
    store = upsertEntry(store, request("c", 3, { createdAt: 0 }));
    store = upsertEntry(store, request("d", -1, { createdAt: 3 }));
    // d first (0), then a, b after original slide 1 (now at 2): 3, 4; c after original 3 (now at 6): 7.
    expect(indices(assignRequestIndices(store))).toEqual({ d: 0, a: 3, b: 4, c: 7 });
  });

  test("applied and dismissed requests leave the chain; a store with nothing to move is returned as is", () => {
    let store = emptyStore();
    store = upsertEntry(store, request("a", 1, { createdAt: 1, status: "applied", slide: { index: 2, sourceFile: null } }));
    store = upsertEntry(store, request("b", 1, { createdAt: 2, status: "dismissed" }));
    store = upsertEntry(store, request("c", 1, { createdAt: 3 }));
    const next = assignRequestIndices(store);
    expect(next.entries.c!.slide.index).toBe(2);
    expect(next.entries.a!.slide.index).toBe(2);
    expect(assignRequestIndices(next)).toBe(next);
  });

  test("rebase shifts pending `after` values at or past each insert, ascending", () => {
    let store = emptyStore();
    store = upsertEntry(store, request("keep", 0, { createdAt: 1 }));
    store = upsertEntry(store, request("at", 2, { createdAt: 2 }));
    store = upsertEntry(store, request("past", 5, { createdAt: 3 }));
    store = upsertEntry(store, request("done", 1, { createdAt: 0, status: "applied", slide: { index: 2, sourceFile: null } }));
    // Inserts landed at 2 and 4: "after 2" names a slide that moved to 3, "after 5" one that moved twice.
    const next = rebaseRequestsAfterInsert(store, [4, 2]);
    expect(next.entries.keep!.request!.after).toBe(0);
    expect(next.entries.at!.request!.after).toBe(3);
    expect(next.entries.past!.request!.after).toBe(7);
    expect(next.entries.done!.request!.after).toBe(1);
    expect(rebaseRequestsAfterInsert(store, [])).toBe(store);
  });
});
