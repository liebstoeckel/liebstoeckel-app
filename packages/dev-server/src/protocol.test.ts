import { describe, expect, test } from "bun:test";
import { type DevBackend, createDevProtocol } from "./protocol";
import type { RestoreResult } from "./snapshot";
import { type AnnotationStore, emptyStore } from "./store";

// The /__dev protocol over an in-memory backend: no filesystem, no Bun.serve.
// Proves the handler is host-independent and pins the lifecycle the drawer
// and the agent rely on.

interface MemoryBackend extends DevBackend {
  store: AnnotationStore;
  /** Insertion order doubles as dispatch order. */
  snapshots: Map<string, string[]>;
  created: Map<string, string[]>;
  /** Failures the next restore of that batch reports. */
  failures: Map<string, RestoreResult["failures"]>;
  restored: string[];
  stopped: boolean;
}

function memoryBackend(initial: AnnotationStore = emptyStore()): MemoryBackend {
  const backend: MemoryBackend = {
    deckDir: "/deck",
    store: initial,
    snapshots: new Map(),
    created: new Map(),
    failures: new Map(),
    restored: [],
    stopped: false,
    authorize: (url, body) => (body?.token ?? url.searchParams.get("token")) === "tok",
    loadStore: () => backend.store,
    saveStore: (s) => {
      backend.store = s;
    },
    resolveSlides: () => ["slides/01.mdx", "slides/02.mdx", "slides/03.mdx", "slides/04.mdx", "slides/05.mdx"],
    entryFile: () => "main.tsx",
    writeScreenshot: (id) => `${id}.png`,
    screenshotRef: (name) => `/deck/.liebstoeckel/dev/screenshots/${name}`,
    takeSnapshot: (batchId, files) => {
      backend.snapshots.set(batchId, files);
    },
    batchesAfter: (batchId) => {
      const ids = [...backend.snapshots.keys()];
      const at = ids.indexOf(batchId);
      return at === -1 ? [] : ids.slice(at + 1);
    },
    recordCreated: (batchId, files) => {
      const known = backend.snapshots.get(batchId) ?? [];
      backend.created.set(batchId, files.filter((f) => !known.includes(f)));
    },
    restoreSnapshot: (batchId): RestoreResult | null => {
      const files = backend.snapshots.get(batchId);
      if (!files) return null;
      backend.restored.push(batchId);
      return { restored: files, failures: backend.failures.get(batchId) ?? [], skipped: [] };
    },
    removeSnapshot: (batchId) => {
      backend.snapshots.delete(batchId);
    },
    onStop: () => {
      backend.stopped = true;
    },
  };
  return backend;
}

const BASE = "http://dev.local";

function get(path: string): Request {
  return new Request(`${BASE}${path}`);
}

function post(path: string, body: Record<string, unknown>, token = "tok"): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, ...body }),
  });
}

async function body<T>(res: Response | null): Promise<T> {
  return (await res!.json()) as T;
}

describe("routing and auth", () => {
  test("non-/__dev paths are not handled; ping is public; the rest needs authorization", async () => {
    const p = createDevProtocol(memoryBackend());
    expect(await p.handleDevRequest(get("/index.html"))).toBeNull();
    expect((await p.handleDevRequest(get("/__dev/ping")))!.status).toBe(200);
    expect((await p.handleDevRequest(get("/__dev/state")))!.status).toBe(401);
    expect((await p.handleDevRequest(get("/__dev/poll?token=nope")))!.status).toBe(401);
    expect((await p.handleDevRequest(post("/__dev/dispatch", {}, "nope")))!.status).toBe(401);
    p.stop();
  });
});

describe("lifecycle", () => {
  test("annotate -> dispatch -> poll (lease) -> reply done -> revert", async () => {
    const backend = memoryBackend();
    const p = createDevProtocol(backend, { leaseMs: 60_000 });

    expect((await p.handleDevRequest(post("/__dev/dispatch", {})))!.status).toBe(400);

    const saved = await body<{ entry: { id: string; slide: { sourceFile: string | null } } }>(
      await p.handleDevRequest(post("/__dev/annotations", { slideIndex: 1, comments: [{ x: 0, y: 0, text: "t" }] })),
    );
    const id = saved.entry.id;
    expect(saved.entry.slide.sourceFile).toBe("slides/02.mdx");

    const png = new Request(`${BASE}/__dev/screenshot?token=tok&id=${id}`, {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: new Uint8Array(8),
    });
    expect((await p.handleDevRequest(png))!.status).toBe(200);
    expect(backend.store.entries[id]!.screenshot).toBe(`${id}.png`);

    expect(p.agentPolling()).toBe(false);
    const dispatched = await body<{ batchId: string; agentPolling: boolean }>(
      await p.handleDevRequest(post("/__dev/dispatch", {})),
    );
    expect(dispatched.agentPolling).toBe(false);
    expect(backend.snapshots.get(dispatched.batchId)).toEqual(["slides/02.mdx"]);
    expect(backend.store.entries[id]!.status).toBe("dispatched");

    const event = await body<{ type: string; id: string; deckDir: string; annotations: Array<{ screenshotPath: string }>; _instructions: string }>(
      await p.handleDevRequest(get("/__dev/poll?token=tok&timeout=1000")),
    );
    expect(event.type).toBe("apply");
    expect(event.id).toBe(dispatched.batchId);
    expect(event.deckDir).toBe("/deck");
    // Leased and unacknowledged: the agent is working, not polling.
    expect(p.agentBusy()).toBe(true);
    expect((await body<{ agentBusy: boolean }>(await p.handleDevRequest(get("/__dev/state?token=tok")))).agentBusy).toBe(true);
    expect(event.annotations[0]!.screenshotPath).toBe(`/deck/.liebstoeckel/dev/screenshots/${id}.png`);
    expect(event._instructions).toContain(`--reply ${dispatched.batchId} done`);

    // Leased: the next poll parks and times out instead of redelivering.
    const parked = p.handleDevRequest(get("/__dev/poll?token=tok&timeout=50"));
    expect(p.agentPolling()).toBe(true);
    expect((await body<{ type: string }>(await parked)).type).toBe("timeout");
    expect(p.agentPolling()).toBe(false);

    const bad = await p.handleDevRequest(post("/__dev/poll", { id: dispatched.batchId, type: "done", data: { applied: ["ghost"], files: [], notes: [] } }));
    expect(bad!.status).toBe(400);
    const unknown = await p.handleDevRequest(post("/__dev/poll", { id: "nope", type: "done", data: { applied: [], files: [], notes: [] } }));
    expect(unknown!.status).toBe(404);

    const done = await p.handleDevRequest(post("/__dev/poll", { id: dispatched.batchId, type: "done", data: { applied: [id], files: ["slides/02.mdx"], notes: [] } }));
    expect(done!.status).toBe(200);
    expect(backend.store.entries[id]!.status).toBe("applied");
    expect(p.agentBusy()).toBe(false);

    expect((await p.handleDevRequest(post("/__dev/revert", { batchId: "missing" })))!.status).toBe(404);
    const reverted = await body<{ restored: string[] }>(await p.handleDevRequest(post("/__dev/revert", { batchId: dispatched.batchId })));
    expect(reverted.restored).toEqual(["slides/02.mdx"]);
    expect(backend.restored).toEqual([dispatched.batchId]);
    expect(backend.snapshots.has(dispatched.batchId)).toBe(false);
    expect(backend.store.entries[id]!.status).toBe("open");
    p.stop();
  });

  test("a parked poll receives the dispatch the moment it happens; error replies reopen", async () => {
    const backend = memoryBackend();
    const p = createDevProtocol(backend);
    await p.handleDevRequest(post("/__dev/annotations", { slideIndex: 0 }));
    const waiting = p.handleDevRequest(get("/__dev/poll?token=tok&timeout=5000"));
    await Promise.resolve();
    expect(p.agentPolling()).toBe(true);
    const dispatched = await body<{ batchId: string; agentPolling: boolean }>(await p.handleDevRequest(post("/__dev/dispatch", {})));
    expect(dispatched.agentPolling).toBe(true);
    expect((await body<{ id: string }>(await waiting)).id).toBe(dispatched.batchId);

    const id = Object.keys(backend.store.entries)[0]!;
    await p.handleDevRequest(post("/__dev/poll", { id: dispatched.batchId, type: "error", message: "could not parse" }));
    expect(backend.store.entries[id]!.status).toBe("open");
    // The snapshot stays so a half-applied failure can still be reverted,
    // and the created set is sealed at the error reply like at a done reply.
    expect(backend.snapshots.has(dispatched.batchId)).toBe(true);
    expect(backend.created.has(dispatched.batchId)).toBe(true);
    expect((await p.handleDevRequest(post("/__dev/revert", { batchId: dispatched.batchId })))!.status).toBe(200);
    expect(backend.restored).toEqual([dispatched.batchId]);
    p.stop();
  });

  test("dispatched entries from a previous run are requeued on construction", async () => {
    const backend = memoryBackend({
      version: 1,
      entries: {
        a: {
          id: "a",
          slide: { index: 0, sourceFile: "slides/01.mdx" },
          comments: [],
          strokes: [],
          screenshot: null,
          status: "dispatched",
          batchId: "oldbatch",
          createdAt: 1,
          updatedAt: 1,
        },
      },
    });
    const p = createDevProtocol(backend);
    const event = await body<{ type: string; id: string }>(await p.handleDevRequest(get("/__dev/poll?token=tok&timeout=1000")));
    expect(event).toMatchObject({ type: "apply", id: "oldbatch" });
    p.stop();
  });

  test("stop resolves parked polls with exit and notifies the backend once", async () => {
    const backend = memoryBackend();
    const p = createDevProtocol(backend);
    const waiting = p.handleDevRequest(get("/__dev/poll?token=tok&timeout=5000"));
    await Promise.resolve();
    p.stop();
    p.stop();
    expect((await body<{ type: string }>(await waiting)).type).toBe("exit");
    // The host teardown is deferred so the exit responses can leave first.
    expect(backend.stopped).toBe(false);
    await Bun.sleep(150);
    expect(backend.stopped).toBe(true);
  });

  test("presence lingers for a grace period after a reply, delivery does not", async () => {
    const backend = memoryBackend();
    const p = createDevProtocol(backend, { leaseMs: 60_000, presenceGraceMs: 200 });
    await p.handleDevRequest(post("/__dev/annotations", { slideIndex: 0, comments: [{ x: 0.1, y: 0.1, text: "hi" }] }));
    const dispatched = await body<{ batchId: string }>(await p.handleDevRequest(post("/__dev/dispatch", {})));
    const event = await body<{ id: string }>(await p.handleDevRequest(get("/__dev/poll?token=tok&timeout=50")));
    expect(event.id).toBe(dispatched.batchId);
    await p.handleDevRequest(post("/__dev/poll", { id: event.id, type: "done", data: { applied: [], files: [], notes: [] } }));
    // No poll is parked, yet the sidebar still sees an agent for a moment.
    expect(p.agentPolling()).toBe(false);
    expect((await body<{ agentPolling: boolean }>(await p.handleDevRequest(get("/__dev/state?token=tok")))).agentPolling).toBe(true);
    // A dispatch in that window is staged, not delivered: presence is cosmetic.
    await p.handleDevRequest(post("/__dev/annotations", { slideIndex: 0, comments: [{ x: 0.2, y: 0.2, text: "again" }] }));
    expect((await body<{ agentPolling: boolean }>(await p.handleDevRequest(post("/__dev/dispatch", {})))).agentPolling).toBe(false);
    await new Promise((r) => setTimeout(r, 300));
    expect((await body<{ agentPolling: boolean }>(await p.handleDevRequest(get("/__dev/state?token=tok")))).agentPolling).toBe(false);
    p.stop();
  });

  test("a poll whose client went away stops counting as a present agent", async () => {
    const backend = memoryBackend();
    const p = createDevProtocol(backend);
    const ctrl = new AbortController();
    const waiting = p.handleDevRequest(new Request(`${BASE}/__dev/poll?token=tok&timeout=5000`, { signal: ctrl.signal }));
    await Promise.resolve();
    expect(p.agentPolling()).toBe(true);
    ctrl.abort();
    expect(p.agentPolling()).toBe(false);
    await p.handleDevRequest(post("/__dev/annotations", { slideIndex: 0, comments: [{ x: 0.1, y: 0.1, text: "hi" }] }));
    const dispatched = await body<{ agentPolling: boolean }>(await p.handleDevRequest(post("/__dev/dispatch", {})));
    expect(dispatched.agentPolling).toBe(false);
    // The batch was not leased to the dead socket: a fresh poll gets it at once.
    const event = await body<{ type: string }>(await p.handleDevRequest(get("/__dev/poll?token=tok&timeout=500")));
    expect(event.type).toBe("apply");
    p.stop();
    void waiting;
  });

  test("re-saving an entry an agent is working on is refused", async () => {
    const backend = memoryBackend();
    const p = createDevProtocol(backend);
    const saved = await body<{ entry: { id: string } }>(
      await p.handleDevRequest(post("/__dev/annotations", { slideIndex: 0, comments: [{ x: 0.1, y: 0.1, text: "hi" }] })),
    );
    const dispatched = await body<{ batchId: string }>(await p.handleDevRequest(post("/__dev/dispatch", {})));
    const res = await p.handleDevRequest(post("/__dev/annotations", { id: saved.entry.id, slideIndex: 0, comments: [] }));
    expect(res!.status).toBe(409);
    expect((await body<{ batchId: string }>(res)).batchId).toBe(dispatched.batchId);
    expect(backend.store.entries[saved.entry.id]!.status).toBe("dispatched");
    p.stop();
  });
});

describe("slide requests", () => {
  test("requests chained at the same position take consecutive indices and arrive in order", async () => {
    const backend = memoryBackend();
    const p = createDevProtocol(backend);
    const add = async (description: string) =>
      (await body<{ entry: { id: string; slide: { index: number } } }>(
        await p.handleDevRequest(post("/__dev/annotations", { kind: "add-slide", request: { after: 1, description } })),
      )).entry;
    const first = await add("first");
    await Bun.sleep(2);
    const second = await add("second");
    await Bun.sleep(2);
    const third = await add("third");
    expect([first.slide.index, second.slide.index, third.slide.index]).toEqual([2, 3, 4]);

    // Dismissing the middle one closes the gap.
    await p.handleDevRequest(post("/__dev/annotation-status", { id: second.id, status: "dismissed" }));
    expect(backend.store.entries[third.id]!.slide.index).toBe(3);

    const dispatched = await body<{ batchId: string }>(await p.handleDevRequest(post("/__dev/dispatch", {})));
    const event = await body<{ annotations: Array<{ id: string; slide: { index: number } }>; _instructions: string }>(
      await p.handleDevRequest(get("/__dev/poll?token=tok&timeout=500")),
    );
    expect(event.annotations.map((a) => [a.id, a.slide.index])).toEqual([[first.id, 2], [third.id, 3]]);
    expect(event._instructions).toContain("in the order listed");
    void dispatched;
    p.stop();
  });

  test("requests at different positions count the inserts before them; applying re-bases the rest", async () => {
    const backend = memoryBackend();
    const p = createDevProtocol(backend);
    const add = async (after: number, description: string) =>
      (await body<{ entry: { id: string; slide: { index: number } } }>(
        await p.handleDevRequest(post("/__dev/annotations", { kind: "add-slide", request: { after, description } })),
      )).entry;
    // Created later but positioned earlier: the chain orders by position, not creation.
    const late = await add(3, "after slide 4");
    await Bun.sleep(2);
    const early = await add(1, "after slide 2");
    // Inserting at 2 first moves the original slide 3 to 4, so "after 3" is index 5, not 4.
    expect(backend.store.entries[early.id]!.slide.index).toBe(2);
    expect(backend.store.entries[late.id]!.slide.index).toBe(5);

    const dispatched = await body<{ batchId: string }>(await p.handleDevRequest(post("/__dev/dispatch", {})));
    const event = await body<{ annotations: Array<{ id: string; slide: { index: number } }>; _instructions: string }>(
      await p.handleDevRequest(get("/__dev/poll?token=tok&timeout=500")),
    );
    expect(event.annotations.map((a) => [a.id, a.slide.index])).toEqual([[early.id, 2], [late.id, 5]]);
    expect(event._instructions).toContain("at index 2");
    expect(event._instructions).toContain("at index 5");

    // Only the first one applied: the second still names the original slide 3,
    // which now sits at 4, so its `after` moves and its index stays 5.
    await p.handleDevRequest(post("/__dev/poll", { id: dispatched.batchId, type: "done", data: { applied: [early.id], files: ["main.tsx"], notes: [] } }));
    const remaining = backend.store.entries[late.id]!;
    expect(remaining.status).toBe("open");
    expect(remaining.request).toEqual({ after: 4, description: "after slide 4" });
    expect(remaining.slide.index).toBe(5);
    p.stop();
  });

  test("a request in flight keeps the index the agent was told; later requests count it and re-base from what was inserted", async () => {
    // Deck: s0 s1 s2 (+ more). R1 "after 0" is dispatched; while the agent
    // holds it, R2 "first" and R3 "after 1" are added. R1 must still be
    // inserted at 1 (the agent's copy), and after R1 lands R3 must sit after
    // the original slide 1, which is now at 2.
    const backend = memoryBackend();
    const p = createDevProtocol(backend, { leaseMs: 60_000 });
    const add = async (after: number, description: string) =>
      (await body<{ entry: { id: string; slide: { index: number } } }>(
        await p.handleDevRequest(post("/__dev/annotations", { kind: "add-slide", request: { after, description } })),
      )).entry;
    const r1 = await add(0, "R1");
    expect(r1.slide.index).toBe(1);
    const dispatched = await body<{ batchId: string }>(await p.handleDevRequest(post("/__dev/dispatch", {})));
    const event = await body<{ annotations: Array<{ id: string; slide: { index: number } }> }>(
      await p.handleDevRequest(get("/__dev/poll?token=tok&timeout=500")),
    );
    expect(event.annotations).toEqual([{ id: r1.id, slide: { index: 1, sourceFile: null } }].map((a) => expect.objectContaining(a)));

    await Bun.sleep(2);
    const r2 = await add(-1, "R2");
    await Bun.sleep(2);
    const r3 = await add(1, "R3");
    // R2 takes 0; R1 is frozen at 1 (not pushed to 2); R3 counts both: 1 + 1 + 2.
    expect(backend.store.entries[r2.id]!.slide.index).toBe(0);
    expect(backend.store.entries[r1.id]!.slide.index).toBe(1);
    expect(backend.store.entries[r3.id]!.slide.index).toBe(4);
    expect(backend.store.entries[r1.id]!.request!.after).toBe(0);

    await p.handleDevRequest(post("/__dev/poll", { id: dispatched.batchId, type: "done", data: { applied: [r1.id], files: ["main.tsx"], notes: [] } }));
    // Inserted at 1: R3's "after 1" now names index 2; R2's "first" is unaffected.
    expect(backend.store.entries[r3.id]!.request!.after).toBe(2);
    expect(backend.store.entries[r2.id]!.request!.after).toBe(-1);
    expect(backend.store.entries[r2.id]!.slide.index).toBe(0);
    expect(backend.store.entries[r3.id]!.slide.index).toBe(4);
    // Final deck once both land: R2 s0 R1 s1 R3 s2.
    const next = await body<{ batchId: string }>(await p.handleDevRequest(post("/__dev/dispatch", {})));
    const second = await body<{ annotations: Array<{ id: string; slide: { index: number } }> }>(
      await p.handleDevRequest(get("/__dev/poll?token=tok&timeout=500")),
    );
    expect(second.annotations.map((a) => [a.id, a.slide.index])).toEqual([[r2.id, 0], [r3.id, 4]]);
    void next;
    p.stop();
  });

  test("a request chained below an in-flight one at the same position lands after it, across batches", async () => {
    // R1 "after slide 1" is with the agent (index 1). The user queues R2 at
    // the same position: the sidebar shows it below R1's ghost (index 2).
    // After R1 lands at 1, R2 must still go to 2, not slip in front of R1.
    const backend = memoryBackend();
    const p = createDevProtocol(backend, { leaseMs: 60_000 });
    const add = async (after: number, description: string) =>
      (await body<{ entry: { id: string; slide: { index: number } } }>(
        await p.handleDevRequest(post("/__dev/annotations", { kind: "add-slide", request: { after, description } })),
      )).entry;
    const r1 = await add(0, "R1");
    const b1 = await body<{ batchId: string }>(await p.handleDevRequest(post("/__dev/dispatch", {})));
    await p.handleDevRequest(get("/__dev/poll?token=tok&timeout=500"));
    await Bun.sleep(2);
    const r2 = await add(0, "R2");
    expect(backend.store.entries[r2.id]!.slide.index).toBe(2);
    await p.handleDevRequest(post("/__dev/poll", { id: b1.batchId, type: "done", data: { applied: [r1.id], files: ["main.tsx"], notes: [] } }));
    expect(backend.store.entries[r2.id]!.request!.after).toBe(1);
    expect(backend.store.entries[r2.id]!.slide.index).toBe(2);
    const b2 = await body<{ batchId: string }>(await p.handleDevRequest(post("/__dev/dispatch", {})));
    const event = await body<{ annotations: Array<{ id: string; slide: { index: number } }>; _instructions: string }>(
      await p.handleDevRequest(get("/__dev/poll?token=tok&timeout=500")),
    );
    expect(event.annotations.map((a) => [a.id, a.slide.index])).toEqual([[r2.id, 2]]);
    expect(event._instructions).toContain("right after slide 2");
    void b2;
    p.stop();
  });

  test("dispatch is refused while a staged batch waits for an agent (its snapshot would predate this one)", async () => {
    const backend = memoryBackend();
    const p = createDevProtocol(backend, { leaseMs: 60_000 });
    const save = async (text: string) =>
      (await body<{ entry: { id: string } }>(
        await p.handleDevRequest(post("/__dev/annotations", { slideIndex: 1, comments: [{ x: 0, y: 0, text }] })),
      )).entry.id;
    const a = await save("a");
    const b1 = await body<{ batchId: string }>(await p.handleDevRequest(post("/__dev/dispatch", {})));
    // Nobody polled: the batch is staged, not leased.
    expect(p.agentBusy()).toBe(false);
    const b = await save("b");
    const refused = await p.handleDevRequest(post("/__dev/dispatch", {}));
    expect(refused!.status).toBe(409);
    expect(await body<{ error: string; batchId: string }>(refused)).toMatchObject({ error: "batch_pending", batchId: b1.batchId });
    expect(backend.store.entries[b]!.status).toBe("open");
    expect(backend.snapshots.size).toBe(1);
    // Picked up and answered: the next batch may go.
    await p.handleDevRequest(get("/__dev/poll?token=tok&timeout=500"));
    expect((await p.handleDevRequest(post("/__dev/dispatch", {})))!.status).toBe(409);
    await p.handleDevRequest(post("/__dev/poll", { id: b1.batchId, type: "done", data: { applied: [a], files: [], notes: [] } }));
    expect((await p.handleDevRequest(post("/__dev/dispatch", {})))!.status).toBe(200);
    // Reverting the later batch leaves the earlier one's applied state intact, because it was applied first.
    p.stop();
  });

  test("validation, entry-file snapshot, created files recorded on reply, event fields", async () => {
    const backend = memoryBackend();
    const p = createDevProtocol(backend);
    expect((await p.handleDevRequest(post("/__dev/annotations", { kind: "add-slide", request: { after: 0 } })))!.status).toBe(400);
    expect((await p.handleDevRequest(post("/__dev/annotations", { kind: "add-slide", request: { after: -2, description: "x" } })))!.status).toBe(400);
    // Past the last slide of a known deck (5 slides here).
    const past = await p.handleDevRequest(post("/__dev/annotations", { kind: "add-slide", request: { after: 5, description: "x" } }));
    expect(past!.status).toBe(400);
    expect((await body<{ error: string }>(past)).error).toBe("request_after_out_of_range");
    expect((await p.handleDevRequest(post("/__dev/annotations", { slideIndex: -1 })))!.status).toBe(400);
    expect((await p.handleDevRequest(post("/__dev/annotations", { slideIndex: 1.5 })))!.status).toBe(400);
    expect((await p.handleDevRequest(post("/__dev/annotations", { kind: "explode", slideIndex: 0 })))!.status).toBe(400);
    const reserved = await p.handleDevRequest(post("/__dev/annotations", { kind: "move-slide", slideIndex: 0 }));
    expect((await body<{ error: string }>(reserved)).error).toBe("kind_not_implemented");

    const saved = await body<{ entry: { id: string; kind: string; slide: { index: number; sourceFile: null }; request: { after: number; description: string } } }>(
      await p.handleDevRequest(post("/__dev/annotations", { kind: "add-slide", request: { after: 0, description: "  a pie chart  " } })),
    );
    expect(saved.entry.kind).toBe("add-slide");
    expect(saved.entry.slide).toEqual({ index: 1, sourceFile: null });
    expect(saved.entry.request).toEqual({ after: 0, description: "a pie chart" });

    const dispatched = await body<{ batchId: string }>(await p.handleDevRequest(post("/__dev/dispatch", {})));
    expect(backend.snapshots.get(dispatched.batchId)).toEqual(["main.tsx"]);

    const event = await body<{ annotations: Array<{ kind?: string; request?: unknown }>; _instructions: string }>(
      await p.handleDevRequest(get("/__dev/poll?token=tok&timeout=500")),
    );
    expect(event.annotations[0]!.kind).toBe("add-slide");
    expect(event.annotations[0]!.request).toEqual({ after: 0, description: "a pie chart" });
    expect(event._instructions).toContain("create a NEW slide right after slide 1");
    expect(event._instructions).toContain("index 1");

    await p.handleDevRequest(post("/__dev/poll", { id: dispatched.batchId, type: "done", data: { applied: [saved.entry.id], files: ["slides/03-pie.mdx", "main.tsx"], notes: [] } }));
    expect(backend.created.get(dispatched.batchId)).toEqual(["slides/03-pie.mdx"]);
    expect(backend.store.entries[saved.entry.id]!.status).toBe("applied");
    p.stop();
  });
});


describe("hardening", () => {
  test("a duplicate done reply is refused instead of reopening applied entries", async () => {
    const backend = memoryBackend();
    const p = createDevProtocol(backend, { leaseMs: 60_000 });
    const saved = await body<{ entry: { id: string } }>(
      await p.handleDevRequest(post("/__dev/annotations", { slideIndex: 1, comments: [{ x: 0, y: 0, text: "t" }] })),
    );
    const id = saved.entry.id;
    const dispatched = await body<{ batchId: string }>(await p.handleDevRequest(post("/__dev/dispatch", {})));
    await p.handleDevRequest(get("/__dev/poll?token=tok&timeout=1000"));
    const done = { id: dispatched.batchId, type: "done", data: { applied: [id], files: [], notes: [] } };
    expect((await p.handleDevRequest(post("/__dev/poll", done)))!.status).toBe(200);
    expect(backend.store.entries[id]!.status).toBe("applied");
    // The agent retries the reply: refused, and the entry stays applied.
    const dup = await p.handleDevRequest(post("/__dev/poll", { ...done, data: { applied: [], files: [], notes: [] } }));
    expect(dup!.status).toBe(409);
    expect((await body<{ error: string }>(dup)).error).toBe("batch_already_resolved");
    expect(backend.store.entries[id]!.status).toBe("applied");
    p.stop();
  });

  test("dispatch is refused while an agent holds a lease (the snapshot would capture its half-applied work)", async () => {
    const backend = memoryBackend();
    const p = createDevProtocol(backend, { leaseMs: 60_000 });
    await p.handleDevRequest(post("/__dev/annotations", { slideIndex: 1, comments: [{ x: 0, y: 0, text: "a" }] }));
    const b1 = await body<{ batchId: string }>(await p.handleDevRequest(post("/__dev/dispatch", {})));
    await p.handleDevRequest(get("/__dev/poll?token=tok&timeout=1000"));
    const b = await body<{ entry: { id: string } }>(
      await p.handleDevRequest(post("/__dev/annotations", { slideIndex: 0, comments: [{ x: 0, y: 0, text: "b" }] })),
    );
    const refused = await p.handleDevRequest(post("/__dev/dispatch", {}));
    expect(refused!.status).toBe(409);
    expect((await body<{ error: string }>(refused)).error).toBe("agent_busy");
    expect(backend.store.entries[b.entry.id]!.status).toBe("open");
    expect(backend.snapshots.size).toBe(1);
    const aId = Object.values(backend.store.entries).find((e) => e.batchId === b1.batchId)!.id;
    await p.handleDevRequest(post("/__dev/poll", { id: b1.batchId, type: "done", data: { applied: [aId], files: [], notes: [] } }));
    expect((await p.handleDevRequest(post("/__dev/dispatch", {})))!.status).toBe(200);
    p.stop();
  });

  test("a dispatched entry cannot be dismissed or reopened from the sidebar", async () => {
    const backend = memoryBackend();
    const p = createDevProtocol(backend, { leaseMs: 60_000 });
    const saved = await body<{ entry: { id: string } }>(
      await p.handleDevRequest(post("/__dev/annotations", { slideIndex: 1, comments: [{ x: 0, y: 0, text: "a" }] })),
    );
    const b1 = await body<{ batchId: string }>(await p.handleDevRequest(post("/__dev/dispatch", {})));
    for (const status of ["dismissed", "open"]) {
      const res = await p.handleDevRequest(post("/__dev/annotation-status", { id: saved.entry.id, status }));
      expect(res!.status).toBe(409);
      expect(await body<{ error: string; batchId: string }>(res)).toEqual({ error: "entry_dispatched", batchId: b1.batchId });
    }
    expect(backend.store.entries[saved.entry.id]!.status).toBe("dispatched");
    p.stop();
  });

  test("a revert with restore failures keeps the entries applied and the snapshot on disk for a retry", async () => {
    const backend = memoryBackend();
    const p = createDevProtocol(backend);
    await p.handleDevRequest(post("/__dev/annotations", { slideIndex: 1 }));
    const id = Object.keys(backend.store.entries)[0]!;
    const dispatched = await body<{ batchId: string }>(await p.handleDevRequest(post("/__dev/dispatch", {})));
    await p.handleDevRequest(get("/__dev/poll?token=tok&timeout=1000"));
    await p.handleDevRequest(post("/__dev/poll", { id: dispatched.batchId, type: "done", data: { applied: [id], files: [], notes: [] } }));

    backend.failures.set(dispatched.batchId, [{ file: "slides/02.mdx", message: "EBUSY" }]);
    const failed = await p.handleDevRequest(post("/__dev/revert", { batchId: dispatched.batchId }));
    expect(failed!.status).toBe(500);
    expect((await body<{ error: string; failures: unknown[] }>(failed)).error).toBe("revert_incomplete");
    expect(backend.store.entries[id]!.status).toBe("applied");
    expect(backend.snapshots.has(dispatched.batchId)).toBe(true);

    backend.failures.delete(dispatched.batchId);
    expect((await p.handleDevRequest(post("/__dev/revert", { batchId: dispatched.batchId })))!.status).toBe(200);
    expect(backend.store.entries[id]!.status).toBe("open");
    expect(backend.snapshots.has(dispatched.batchId)).toBe(false);
    p.stop();
  });

  test("reverting an older batch reopens every batch dispatched after it", async () => {
    const backend = memoryBackend();
    const p = createDevProtocol(backend, { leaseMs: 60_000 });
    const round = async (text: string) => {
      const saved = await body<{ entry: { id: string } }>(
        await p.handleDevRequest(post("/__dev/annotations", { slideIndex: 1, comments: [{ x: 0, y: 0, text }] })),
      );
      const { batchId } = await body<{ batchId: string }>(await p.handleDevRequest(post("/__dev/dispatch", {})));
      await p.handleDevRequest(get("/__dev/poll?token=tok&timeout=500"));
      await p.handleDevRequest(post("/__dev/poll", { id: batchId, type: "done", data: { applied: [saved.entry.id], files: [], notes: [] } }));
      return { id: saved.entry.id, batchId };
    };
    const a = await round("a");
    const b = await round("b");
    const c = await round("c");
    const reverted = await body<{ reopenedBatches: string[] }>(await p.handleDevRequest(post("/__dev/revert", { batchId: b.batchId })));
    expect(reverted.reopenedBatches).toEqual([c.batchId]);
    expect(backend.restored).toEqual([b.batchId]);
    expect(backend.store.entries[a.id]!.status).toBe("applied");
    expect(backend.store.entries[b.id]!.status).toBe("open");
    expect(backend.store.entries[c.id]!.status).toBe("open");
    expect(backend.snapshots.has(a.batchId)).toBe(true);
    expect(backend.snapshots.has(b.batchId)).toBe(false);
    expect(backend.snapshots.has(c.batchId)).toBe(false);
    p.stop();
  });

  test("poll?timeout=0 is a probe that returns at once", async () => {
    const p = createDevProtocol(memoryBackend());
    const started = Date.now();
    const event = await body<{ type: string }>(await p.handleDevRequest(get("/__dev/poll?token=tok&timeout=0")));
    expect(event.type).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(100);
    p.stop();
  });

  test("revert is refused while an agent holds a lease (whole-tree restore would wipe its work)", async () => {
    const backend = memoryBackend();
    const p = createDevProtocol(backend, { leaseMs: 60_000 });
    const a = await body<{ entry: { id: string } }>(
      await p.handleDevRequest(post("/__dev/annotations", { slideIndex: 1, comments: [{ x: 0, y: 0, text: "a" }] })),
    );
    const b1 = await body<{ batchId: string }>(await p.handleDevRequest(post("/__dev/dispatch", {})));
    await p.handleDevRequest(get("/__dev/poll?token=tok&timeout=1000"));
    await p.handleDevRequest(post("/__dev/poll", { id: b1.batchId, type: "done", data: { applied: [a.entry.id], files: [], notes: [] } }));
    // A second batch is now with the agent.
    await p.handleDevRequest(post("/__dev/annotations", { slideIndex: 0, comments: [{ x: 0, y: 0, text: "b" }] }));
    const b2 = await body<{ batchId: string }>(await p.handleDevRequest(post("/__dev/dispatch", {})));
    await p.handleDevRequest(get("/__dev/poll?token=tok&timeout=1000"));
    expect(p.agentBusy()).toBe(true);
    const refused = await p.handleDevRequest(post("/__dev/revert", { batchId: b1.batchId }));
    expect(refused!.status).toBe(409);
    expect((await body<{ error: string }>(refused)).error).toBe("agent_busy");
    expect(backend.restored).toEqual([]);
    // After the agent replies, revert works again.
    const bId = Object.values(backend.store.entries).find((e) => e.batchId === b2.batchId)!.id;
    await p.handleDevRequest(post("/__dev/poll", { id: b2.batchId, type: "done", data: { applied: [bId], files: [], notes: [] } }));
    expect((await p.handleDevRequest(post("/__dev/revert", { batchId: b1.batchId })))!.status).toBe(200);
    p.stop();
  });
});
