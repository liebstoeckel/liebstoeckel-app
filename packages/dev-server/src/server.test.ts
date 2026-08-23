import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type DevServer, startDevServer } from "./server";
import { loadStore } from "./local-backend";

// Integration against a real Bun.serve in apiOnly mode: the /__dev surface end
// to end (token auth, stash -> dispatch -> poll -> lease -> reply -> statuses,
// screenshot cap, revert), without dragging the deck HTML pipeline into tests.

let server: DevServer;
let deckDir: string;
let base: string;

function makeDeck(): string {
  const dir = mkdtempSync(join(tmpdir(), "lst-dev-server-"));
  mkdirSync(join(dir, "slides"), { recursive: true });
  writeFileSync(
    join(dir, "index.html"),
    '<html><body><script type="module" src="./main.tsx"></script></body></html>',
  );
  writeFileSync(
    join(dir, "main.tsx"),
    'import Title from "./slides/01-title.mdx";\nrender(<Present slides={[Title]} />);\n',
  );
  writeFileSync(join(dir, "slides", "01-title.mdx"), "# original title\n");
  return dir;
}

beforeAll(async () => {
  deckDir = makeDeck();
  server = await startDevServer({ deckDir, apiOnly: true });
  base = `http://127.0.0.1:${server.port}`;
});

afterAll(() => {
  server.stop();
});

function post(path: string, body: Record<string, unknown>, token = server.token): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, ...body }),
  });
}

describe("auth", () => {
  test("ping is public; state, poll, and mutations require the token", async () => {
    expect((await fetch(`${base}/__dev/ping`)).status).toBe(200);
    expect((await fetch(`${base}/__dev/state`)).status).toBe(401);
    expect((await fetch(`${base}/__dev/state?token=wrong`)).status).toBe(401);
    expect((await fetch(`${base}/__dev/poll?token=wrong`)).status).toBe(401);
    expect((await post("/__dev/annotations", { slideIndex: 0 }, "wrong")).status).toBe(401);
  });

  test("the shell document carries the session token; the bridge does not", async () => {
    const html = await (await fetch(`${base}/`)).text();
    expect(html).toContain(server.token);
    expect(html).toContain("/__dev/shell.js");
    expect((await fetch(`${base}/__dev/shell.js`)).status).toBe(200);
    const bridge = await (await fetch(`${base}/__dev/bridge.js`)).text();
    expect(bridge).not.toContain(server.token);
    expect(bridge).toContain("lst:hello");
    expect((await fetch(`${base}/__dev/drawer.js`)).status).toBe(200);
  });
});

describe("annotation flow", () => {
  let entryId: string;
  let batchId: string;

  test("stash resolves the slide source and persists", async () => {
    const res = await post("/__dev/annotations", {
      slideIndex: 0,
      comments: [{ x: 0.4, y: 0.3, text: "make the title bolder" }],
      strokes: [{ points: [[0.1, 0.1], [0.2, 0.2]] }],
    });
    expect(res.status).toBe(200);
    const { entry } = (await res.json()) as { entry: { id: string; slide: { sourceFile: string | null } } };
    entryId = entry.id;
    expect(entry.slide.sourceFile).toBe("slides/01-title.mdx");
    expect(loadStore(deckDir).entries[entryId]!.status).toBe("open");
  });

  test("screenshot upload is size-capped and type-checked", async () => {
    const png = new Uint8Array(64).fill(1);
    const upload = await fetch(`${base}/__dev/screenshot?token=${server.token}&id=${entryId}`, {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: png,
    });
    expect(upload.status).toBe(200);
    const wrongType = await fetch(`${base}/__dev/screenshot?token=${server.token}&id=${entryId}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "x",
    });
    expect(wrongType.status).toBe(415);
    const huge = await fetch(`${base}/__dev/screenshot?token=${server.token}&id=${entryId}`, {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: new Uint8Array(11 * 1024 * 1024),
    });
    expect(huge.status).toBe(413);
  });

  test("dispatch -> poll delivers the apply event with _instructions and a snapshot exists", async () => {
    const dispatch = await post("/__dev/dispatch", {});
    expect(dispatch.status).toBe(200);
    batchId = ((await dispatch.json()) as { batchId: string }).batchId;
    expect(loadStore(deckDir).entries[entryId]!.status).toBe("dispatched");

    const poll = await fetch(`${base}/__dev/poll?token=${server.token}&timeout=2000`);
    const event = (await poll.json()) as {
      type: string;
      id: string;
      annotations: Array<{ id: string; screenshotPath: string | null }>;
      _instructions: string;
    };
    expect(event.type).toBe("apply");
    expect(event.id).toBe(batchId);
    expect(event.annotations[0]!.id).toBe(entryId);
    expect(event.annotations[0]!.screenshotPath).toContain(`${entryId}.png`);
    expect(event._instructions).toContain(`--reply ${batchId} done`);

    // Leased: a second poll times out instead of double-delivering.
    const second = await fetch(`${base}/__dev/poll?token=${server.token}&timeout=1100`);
    expect(((await second.json()) as { type: string }).type).toBe("timeout");
  });

  test("a malformed reply is rejected, a good reply flips statuses", async () => {
    const bad = await post("/__dev/poll", { id: batchId, type: "done", data: { applied: ["ghost"], files: [], notes: [] } });
    expect(bad.status).toBe(400);

    // Simulate the agent's edit, then reply.
    writeFileSync(join(deckDir, "slides", "01-title.mdx"), "# BOLD TITLE\n");
    const good = await post("/__dev/poll", {
      id: batchId,
      type: "done",
      data: { applied: [entryId], files: ["slides/01-title.mdx"], notes: ["made it bold"] },
    });
    expect(good.status).toBe(200);
    expect(loadStore(deckDir).entries[entryId]!.status).toBe("applied");
  });

  test("revert restores the snapshot and reopens the entries", async () => {
    const revert = await post("/__dev/revert", { batchId });
    expect(revert.status).toBe(200);
    expect(readFileSync(join(deckDir, "slides", "01-title.mdx"), "utf-8")).toBe("# original title\n");
    expect(loadStore(deckDir).entries[entryId]!.status).toBe("open");
  });

  test("unknown reply ids 404", async () => {
    expect((await post("/__dev/poll", { id: "nope", type: "done", data: { applied: [], files: [], notes: [] } })).status).toBe(404);
  });

  test("dispatch with nothing open is a 400", async () => {
    await post("/__dev/annotation-status", { id: entryId, status: "dismissed" });
    expect((await post("/__dev/dispatch", {})).status).toBe(400);
  });
});

describe("restart requeue", () => {
  test("a dispatched-but-unresolved batch is redelivered by a fresh server", async () => {
    const dir = makeDeck();
    const first = await startDevServer({ deckDir: dir, apiOnly: true });
    const firstBase = `http://127.0.0.1:${first.port}`;
    await fetch(`${firstBase}/__dev/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: first.token, slideIndex: 0, comments: [{ x: 0, y: 0, text: "t" }], strokes: [] }),
    });
    const dispatched = await fetch(`${firstBase}/__dev/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: first.token }),
    });
    const { batchId: pendingBatch } = (await dispatched.json()) as { batchId: string };
    first.stop();

    const second = await startDevServer({ deckDir: dir, apiOnly: true });
    const poll = await fetch(`http://127.0.0.1:${second.port}/__dev/poll?token=${second.token}&timeout=2000`);
    const event = (await poll.json()) as { type: string; id: string };
    expect(event.type).toBe("apply");
    expect(event.id).toBe(pendingBatch);
    second.stop();
  });
});
