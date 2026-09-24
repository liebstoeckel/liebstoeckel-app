// Epoch-fenced session state: the control plane places a session under an epoch,
// the relay writes an update log and snapshots under it, a newer placement or an
// end in storage stops the old owner, and requests for older epochs are refused.
import { afterEach, describe, expect, test } from "bun:test";
import { CLOSE } from "@liebstoeckel/live-server/placement/protocol";
import * as Y from "yjs";
import { createRelay, type RelayServer } from "./relay-server";
import { latestState, markEnded } from "./state";

const TOKEN = "acct-secret-token";
const DECK = "<!doctype html><html><head><title>deck</title></head><body><div id=root></div></body></html>";

const relays: RelayServer[] = [];
afterEach(async () => {
  for (const r of relays.splice(0)) await r.stop().catch(() => undefined);
});

function memStorage() {
  const store = new Map<string, Uint8Array>();
  return {
    store,
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, b: Uint8Array) => void store.set(k, b.slice()),
    list: async (prefix: string) => [...store.keys()].filter((k) => k.startsWith(prefix)),
    delete: async (k: string) => void store.delete(k),
    keys: (epoch?: number) =>
      [...store.keys()].filter((k) => epoch === undefined || k.includes(`/${String(epoch).padStart(12, "0")}/`)).sort(),
  };
}
type Storage = ReturnType<typeof memStorage>;

function start(storage: Storage, extra: Partial<Parameters<typeof createRelay>[0]> = {}) {
  const relay = createRelay({ accountTokens: [TOKEN], hostname: "127.0.0.1", port: 0, storage, logFlushMs: 20, fenceMs: 30, snapshotMs: 1_000_000, ...extra });
  relays.push(relay);
  return { relay, base: `http://127.0.0.1:${relay.port}` };
}

const place = (base: string, epoch: number, id = "s1") =>
  fetch(`${base}/api/sessions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "text/html",
      "x-live-enforce": "1",
      "x-session-id": id,
      "x-session-epoch": String(epoch),
      "x-state-org": "org1",
    },
    body: DECK,
  });

/** Change the session's document as a participant would (a vote). */
const vote = (relay: RelayServer, n: number, id = "s1") => relay.sessions.get(id)!.hub.doc.getMap("poll").set("votes", n);
const votesIn = (update: Uint8Array | null) => {
  const doc = new Y.Doc();
  if (update) Y.applyUpdate(doc, update);
  return doc.getMap("poll").get("votes");
};

const until = async (cond: () => boolean | Promise<boolean>, ms = 3_000) => {
  const end = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > end) throw new Error("timed out");
    await Bun.sleep(10);
  }
};

/** A presenter socket that records its close code. */
async function socket(relay: RelayServer, base: string, id = "s1") {
  const s = relay.sessions.get(id)!;
  const ws = new WebSocket(`${base.replace("http", "ws")}/sync/${id}?t=${s.session.presenterToken}`);
  const state = { open: false, code: 0 };
  ws.addEventListener("open", () => (state.open = true));
  ws.addEventListener("close", (e) => (state.code = e.code));
  await until(() => state.open);
  return state;
}

describe("epoch-fenced session state", () => {
  test("a placement writes a snapshot at once and every change to the log within the flush period", async () => {
    const storage = memStorage();
    const { relay, base } = start(storage);
    expect((await place(base, 1)).status).toBe(200);
    expect(storage.keys(1).some((k) => k.endsWith(".snap"))).toBe(true);
    vote(relay, 3);
    await until(() => storage.keys(1).some((k) => k.endsWith(".log")));
    expect(votesIn(await latestState(storage, "org1", "s1"))).toBe(3);
  });

  test("a new placement loads the previous epoch; the old owner stops, stores nothing more, and says moved", async () => {
    const storage = memStorage();
    const a = start(storage);
    await place(a.base, 1);
    const sock = await socket(a.relay, a.base);
    vote(a.relay, 5);
    await until(() => storage.keys(1).some((k) => k.endsWith(".log")));

    const b = start(storage);
    expect((await place(b.base, 2)).status).toBe(200);
    expect(votesIn(b.relay.sessions.get("s1")!.hub.snapshot())).toBe(5);

    // a learns from storage that it was replaced.
    await until(() => sock.code !== 0);
    expect(sock.code).toBe(CLOSE.MOVED);
    expect(a.relay.sessions.has("s1")).toBe(false);
    const epoch1 = storage.keys(1).length;
    vote(b.relay, 6);
    await until(async () => votesIn(await latestState(storage, "org1", "s1")) === 6);
    expect(storage.keys(1).length).toBe(epoch1);
  });

  test("a placement for an epoch older than one in storage is refused", async () => {
    const storage = memStorage();
    const { base } = start(storage);
    expect((await place(base, 2)).status).toBe(200);
    const other = start(storage);
    expect((await place(other.base, 1)).status).toBe(409);
  });

  test("a late end or move for an older epoch does not drop the current placement", async () => {
    const storage = memStorage();
    const { relay, base } = start(storage);
    await place(base, 3);
    const del = (epoch: number, reason = "") =>
      fetch(`${base}/api/sessions/s1${reason ? `?reason=${reason}` : ""}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${TOKEN}`, "x-session-epoch": String(epoch) },
      });
    expect((await del(3)).status).toBe(409);
    expect((await del(2, "moved")).status).toBe(409);
    expect(relay.sessions.has("s1")).toBe(true);
  });

  test("ending stores the final state and closes sockets with ended", async () => {
    const storage = memStorage();
    const { relay, base } = start(storage);
    await place(base, 1);
    const sock = await socket(relay, base);
    vote(relay, 9);
    const res = await fetch(`${base}/api/sessions/s1`, { method: "DELETE", headers: { authorization: `Bearer ${TOKEN}`, "x-session-epoch": "2" } });
    expect(res.status).toBe(204);
    await until(() => sock.code !== 0);
    expect(sock.code).toBe(CLOSE.ENDED);
    expect(votesIn(await latestState(storage, "org1", "s1"))).toBe(9);
  });

  test("a move stores nothing and closes sockets with moved", async () => {
    const storage = memStorage();
    const { relay, base } = start(storage, { logFlushMs: 1_000_000 });
    await place(base, 1);
    const sock = await socket(relay, base);
    const before = storage.keys().length;
    vote(relay, 2);
    await fetch(`${base}/api/sessions/s1?reason=moved`, { method: "DELETE", headers: { authorization: `Bearer ${TOKEN}`, "x-session-epoch": "2" } });
    await until(() => sock.code !== 0);
    expect(sock.code).toBe(CLOSE.MOVED);
    expect(storage.keys().length).toBe(before);
  });

  test("an end marked in storage stops an owner the control plane could not reach", async () => {
    const storage = memStorage();
    const { relay, base } = start(storage);
    await place(base, 1);
    const sock = await socket(relay, base);
    vote(relay, 4);
    await markEnded(storage, "org1", "s1", 2);
    await until(() => sock.code !== 0);
    expect(sock.code).toBe(CLOSE.ENDED);
    // The owner stored its final state under its own epoch; results read it.
    expect(votesIn(await latestState(storage, "org1", "s1"))).toBe(4);
  });

  test("shutdown stores every session and says restarting", async () => {
    const storage = memStorage();
    const { relay, base } = start(storage, { logFlushMs: 1_000_000 });
    await place(base, 1);
    const sock = await socket(relay, base);
    vote(relay, 7);
    await relay.stop();
    relays.length = 0;
    await until(() => sock.code !== 0);
    expect(sock.code).toBe(CLOSE.RESTARTING);
    expect(votesIn(await latestState(storage, "org1", "s1"))).toBe(7);
  });

  test("snapshots keep two and drop what a load no longer needs", async () => {
    const storage = memStorage();
    const { relay, base } = start(storage, { snapshotMs: 40 });
    await place(base, 1);
    for (let i = 0; i < 6; i++) {
      vote(relay, i);
      await Bun.sleep(50);
    }
    const snaps = storage.keys(1).filter((k) => k.endsWith(".snap"));
    expect(snaps.length).toBeLessThanOrEqual(3);
    expect(votesIn(await latestState(storage, "org1", "s1"))).toBe(5);
  });

  test("a relay with a liveness lease reports its holder with each session and in /stats", async () => {
    const storage = memStorage();
    const { base } = start(storage, { holder: "relay-0_abc123" });
    const created = (await (await place(base, 1)).json()) as { holder?: string };
    expect(created.holder).toBe("relay-0_abc123");
    const stats = (await (await fetch(`${base}/stats`, { headers: { authorization: `Bearer ${TOKEN}` } })).json()) as { holder?: string };
    expect(stats.holder).toBe("relay-0_abc123");
  });

  test("without epoch headers the single snapshot key works as before", async () => {
    const storage = memStorage();
    const { base } = start(storage);
    const res = await fetch(`${base}/api/sessions`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "text/html", "x-snapshot-key": "org1/live/legacy.snap", "x-session-id": "legacy" },
      body: DECK,
    });
    expect(res.status).toBe(200);
    expect(storage.keys().every((k) => !k.startsWith("live/"))).toBe(true);
  });

  test("a first epoch seeds from the single snapshot key of a session placed before epochs", async () => {
    const storage = memStorage();
    const legacy = new Y.Doc();
    legacy.getMap("poll").set("votes", 11);
    await storage.put("org1/live/s1.snap", Y.encodeStateAsUpdate(legacy));
    const { relay, base } = start(storage);
    const res = await fetch(`${base}/api/sessions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "text/html",
        "x-session-id": "s1",
        "x-session-epoch": "1",
        "x-state-org": "org1",
        "x-snapshot-key": "org1/live/s1.snap",
      },
      body: DECK,
    });
    expect(res.status).toBe(200);
    expect(votesIn(relay.sessions.get("s1")!.hub.snapshot())).toBe(11);
  });
});
