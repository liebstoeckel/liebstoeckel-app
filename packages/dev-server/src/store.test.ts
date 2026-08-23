import { describe, expect, test } from "bun:test";
import {
  type AnnotationEntry,
  emptyStore,
  entriesByStatus,
  entriesInBatch,
  parseStore,
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
