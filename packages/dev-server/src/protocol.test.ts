import { describe, expect, test } from "bun:test";
import { type DevBackend, createDevProtocol } from "./protocol";
import type { RestoreResult } from "./snapshot";
import { type AnnotationStore, emptyStore } from "./store";

// The /__dev protocol over an in-memory backend: no filesystem, no Bun.serve.
// Proves the handler is host-independent and pins the lifecycle the drawer
// and the agent rely on.

interface MemoryBackend extends DevBackend {
  store: AnnotationStore;
  snapshots: Map<string, string[]>;
  restored: string[];
  stopped: boolean;
}

function memoryBackend(initial: AnnotationStore = emptyStore()): MemoryBackend {
  const backend: MemoryBackend = {
    deckDir: "/deck",
    store: initial,
    snapshots: new Map(),
    restored: [],
    stopped: false,
    authorize: (url, body) => (body?.token ?? url.searchParams.get("token")) === "tok",
    loadStore: () => backend.store,
    saveStore: (s) => {
      backend.store = s;
    },
    resolveSlides: () => ["slides/01.mdx", "slides/02.mdx"],
    writeScreenshot: (id) => `${id}.png`,
    screenshotRef: (name) => `/deck/.liebstoeckel/dev/screenshots/${name}`,
    takeSnapshot: (batchId, files) => {
      backend.snapshots.set(batchId, files);
    },
    restoreSnapshot: (batchId): RestoreResult | null => {
      const files = backend.snapshots.get(batchId);
      if (!files) return null;
      backend.restored.push(batchId);
      return { restored: files, failures: [] };
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
    expect(backend.snapshots.has(dispatched.batchId)).toBe(false);
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
    expect(backend.stopped).toBe(true);
  });
});
