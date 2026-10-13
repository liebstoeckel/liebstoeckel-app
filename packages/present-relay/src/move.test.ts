// A talk that moves to another relay (a pod deleted mid-talk, a crash, a restart) must
// not lose what the audience wrote. The writes the old relay took but never stored, and
// the ones still on their way, are in the viewers' own docs; a viewer sends them again
// when it reconnects, and the new relay has to take them from the viewer that wrote them.
import { afterEach, describe, expect, test } from "bun:test";
import { CLOSE, LIVE_PROTOCOL } from "@liebstoeckel/live-server/placement/protocol";
import * as Y from "yjs";
import { createRelay, ownerKey, type RelayServer } from "./relay-server";

const TOKEN = "acct-secret-token";
const MANIFEST = JSON.stringify({
  v: 1,
  plugins: [{ name: "poll", version: "0", hasServer: false, id: "poll", audienceWrites: ["votes"] }],
});
const DECK =
  `<!doctype html><html><head><title>deck</title></head><body><div id=root></div>` +
  `<script type="application/json" data-liebstoeckel-plugins>${MANIFEST}</script></body></html>`;

const relays: RelayServer[] = [];
const cleanups: Array<() => void> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) c();
  for (const r of relays.splice(0)) await r.stop().catch(() => undefined);
});

/** Object storage shared by the relays. `lose`: writes from now on are acknowledged but
 *  never kept, as when a relay dies before they land. `hold`: snapshot writes wait. */
function memStorage() {
  const store = new Map<string, Uint8Array>();
  const ctl = { lose: false, hold: null as Promise<void> | null, held: 0 };
  return {
    store,
    ctl,
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, b: Uint8Array) => {
      if (k.endsWith(".snap") && ctl.hold) {
        ctl.held++;
        await ctl.hold;
      }
      if (!ctl.lose) store.set(k, b.slice());
    },
    list: async (prefix: string) => [...store.keys()].filter((k) => k.startsWith(prefix)),
    delete: async (k: string) => void store.delete(k),
  };
}
type Storage = ReturnType<typeof memStorage>;

function start(storage: Storage) {
  const relay = createRelay({
    accountTokens: [TOKEN],
    hostname: "127.0.0.1",
    port: 0,
    storage,
    logFlushMs: 20,
    fenceMs: 50,
    snapshotMs: 1_000_000,
    resetMinGapMs: 0,
  });
  relays.push(relay);
  return { relay, base: `http://127.0.0.1:${relay.port}` };
}

/** Place session `s1` on a relay under `epoch`, as the control plane does. */
async function place(base: string, epoch: number) {
  const res = await fetch(`${base}/api/sessions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "text/html",
      "x-live-enforce": "1",
      "x-session-id": "s1",
      "x-session-epoch": String(epoch),
      "x-state-org": "org1",
    },
    body: DECK,
  });
  expect(res.status).toBe(200);
  return (await res.json()) as { presenterToken: string; viewerToken: string; viewerGrant: string };
}

const until = async (cond: () => boolean | Promise<boolean>, ms = 5_000) => {
  const end = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > end) throw new Error("timed out");
    await Bun.sleep(10);
  }
};

const votes = (doc: Y.Doc) => doc.getMap("plugin:poll").get("votes") as Y.Map<string> | undefined;
const voteOn = (relay: RelayServer, pid: string) => votes(relay.sessions.get("s1")!.hub.doc)?.get(pid);

/** A viewer the way the engine's live client behaves on protocol 3: a fresh Yjs client
 *  id for every connection, the resume token sent back on reconnect, its whole doc sent
 *  when a socket opens, local changes sent as they happen, the doc replaced after a
 *  refusal. It reconnects to wherever `route()` says the talk is now (the ingress). */
function viewer(route: () => string | null, token: string) {
  let doc = new Y.Doc();
  let ws: WebSocket | null = null;
  let resume: string | undefined;
  let closed = false;
  let resetNext = false;
  const refused: Array<{ reason: string; roots: string[] }> = [];
  const closes: number[] = [];
  const state = { open: false, synced: false };
  const onUpdate = (u: Uint8Array, origin: unknown) => {
    if (origin !== "remote" && ws?.readyState === WebSocket.OPEN) ws.send(new Uint8Array(u));
  };
  doc.on("update", onUpdate);
  const open = () => {
    if (closed) return;
    const base = route();
    if (!base) return void setTimeout(open, 20);
    const url = `${base.replace("http", "ws")}/sync/s1?t=${token}&p=pid1&v=${LIVE_PROTOCOL.max}${resume ? `&r=${resume}` : ""}`;
    const sock = new WebSocket(url);
    ws = sock;
    sock.binaryType = "arraybuffer";
    sock.addEventListener("open", () => {
      state.open = true;
      sock.send(new Uint8Array(Y.encodeStateAsUpdate(doc)));
    });
    sock.addEventListener("message", (e) => {
      if (typeof e.data === "string") {
        const n = JSON.parse(e.data) as { t: string; token?: string; reason?: string; roots?: string[] };
        if (n.t === "resume") resume = n.token;
        if (n.t === "refused") refused.push({ reason: n.reason!, roots: n.roots ?? [] });
        if (n.t === "reset") resetNext = true;
        return;
      }
      const bytes = new Uint8Array(e.data as ArrayBuffer);
      if (resetNext) {
        resetNext = false;
        doc.off("update", onUpdate);
        doc = new Y.Doc();
        Y.applyUpdate(doc, bytes, "remote");
        doc.on("update", onUpdate);
      } else Y.applyUpdate(doc, bytes, "remote");
      state.synced = true;
    });
    sock.addEventListener("close", (e) => {
      if (ws !== sock) return;
      state.open = false;
      closes.push(e.code);
      if (closed) return;
      doc.clientID = Math.floor(Math.random() * 2 ** 31);
      setTimeout(open, 20);
    });
  };
  open();
  cleanups.push(() => {
    closed = true;
    ws?.close();
  });
  return {
    refused,
    closes,
    state,
    get doc() {
      return doc;
    },
    get resume() {
      return resume;
    },
    vote(value: string) {
      votes(doc)!.set("pid1", value);
    },
    async reconnected(n: number) {
      await until(() => closes.length >= n && state.open);
      // the resync has been read once the relay answers a later frame; a short settle
      await Bun.sleep(100);
    },
  };
}

/** A presenter socket that puts the poll into the session. */
async function presenter(base: string, token: string) {
  const ws = new WebSocket(`${base.replace("http", "ws")}/sync/s1?t=${token}&v=${LIVE_PROTOCOL.max}`);
  ws.binaryType = "arraybuffer";
  await new Promise<void>((r) => ws.addEventListener("open", () => r()));
  const d = new Y.Doc();
  d.getMap("plugin:poll").set("votes", new Y.Map<string>());
  ws.send(new Uint8Array(Y.encodeStateAsUpdate(d)));
  cleanups.push(() => ws.close());
}

describe("a talk that moves to another relay", () => {
  test("a write the old relay took but never stored arrives with the viewer's resync, and the next one is not refused", async () => {
    const storage = memStorage();
    const a = start(storage);
    const { presenterToken, viewerGrant } = await place(a.base, 1);
    await presenter(a.base, presenterToken);
    let current: string | null = a.base;
    const v = viewer(() => current, viewerGrant);
    await until(() => v.state.synced && !!votes(v.doc) && !!v.resume);

    // A vote that is stored, then one the relay takes but that never lands in storage
    // (written after its last flush, then the relay goes).
    v.vote("x");
    await until(() => voteOn(a.relay, "pid1") === "x");
    await Bun.sleep(100); // flushed
    storage.ctl.lose = true;
    v.vote("a");
    await until(() => voteOn(a.relay, "pid1") === "a");
    current = null;
    await a.relay.stop();
    storage.ctl.lose = false;

    // The control plane places the talk on another relay; the viewer comes back to it.
    const b = start(storage);
    await place(b.base, 2);
    expect(voteOn(b.relay, "pid1")).toBe("x"); // what was stored
    current = b.base;
    await v.reconnected(1);
    expect(v.closes[0]).toBe(CLOSE.RESTARTING);
    expect(voteOn(b.relay, "pid1")).toBe("a"); // the lost write came back with the resync

    // Changing the vote builds on the write the store had lost.
    v.vote("b");
    await until(() => voteOn(b.relay, "pid1") === "b");
    expect(v.refused).toEqual([]);
  });

  test("a write sent while the relay stores its final state is not lost", async () => {
    const storage = memStorage();
    const a = start(storage);
    const { presenterToken, viewerGrant } = await place(a.base, 1);
    await presenter(a.base, presenterToken);
    let current: string | null = a.base;
    const v = viewer(() => current, viewerGrant);
    await until(() => v.state.synced && !!votes(v.doc));
    v.vote("x");
    await until(() => voteOn(a.relay, "pid1") === "x");
    await Bun.sleep(100);

    // The final snapshot write hangs for a moment; the viewer votes meanwhile.
    let release!: () => void;
    storage.ctl.hold = new Promise<void>((r) => (release = r));
    current = null;
    const stopping = a.relay.stop();
    await until(() => storage.ctl.held > 0);
    v.vote("y");
    await Bun.sleep(50);
    release();
    storage.ctl.hold = null;
    await stopping;

    const b = start(storage);
    await place(b.base, 2);
    current = b.base;
    await v.reconnected(1);
    await until(() => voteOn(b.relay, "pid1") === "y");
    v.vote("z");
    await until(() => voteOn(b.relay, "pid1") === "z");
    expect(v.refused).toEqual([]);
  });

  test("who owns which id survives a second move before the viewer comes back", async () => {
    const storage = memStorage();
    const a = start(storage);
    const { presenterToken, viewerGrant } = await place(a.base, 1);
    await presenter(a.base, presenterToken);
    let current: string | null = a.base;
    const v = viewer(() => current, viewerGrant);
    await until(() => v.state.synced && !!votes(v.doc) && !!v.resume);
    v.vote("x");
    await until(() => voteOn(a.relay, "pid1") === "x");
    await Bun.sleep(100);
    storage.ctl.lose = true;
    v.vote("a");
    await until(() => voteOn(a.relay, "pid1") === "a");
    current = null;
    await a.relay.stop();
    storage.ctl.lose = false;

    // Placed on b, which goes too before the viewer is back; then on c.
    const b = start(storage);
    await place(b.base, 2);
    await b.relay.stop();
    const c = start(storage);
    await place(c.base, 3);
    current = c.base;
    await v.reconnected(1);
    expect(voteOn(c.relay, "pid1")).toBe("a");
    v.vote("b");
    await until(() => voteOn(c.relay, "pid1") === "b");
    expect(v.refused).toEqual([]);
  });

  test("a talk placed again on the relay that holds it keeps what that relay took but had not stored", async () => {
    const storage = memStorage();
    const a = start(storage);
    const { presenterToken, viewerGrant } = await place(a.base, 1);
    await presenter(a.base, presenterToken);
    const v = viewer(() => a.base, viewerGrant);
    await until(() => v.state.synced && !!votes(v.doc) && !!v.resume);
    v.vote("x");
    await until(() => voteOn(a.relay, "pid1") === "x");
    storage.ctl.lose = true;
    v.vote("y");
    await until(() => voteOn(a.relay, "pid1") === "y");
    // a second placement onto the same relay (the control plane recovered it twice)
    await place(a.base, 2);
    storage.ctl.lose = false;
    expect(voteOn(a.relay, "pid1")).toBe("y");
    await v.reconnected(1);
    expect(v.closes[0]).toBe(CLOSE.MOVED);
    v.vote("z");
    await until(() => voteOn(a.relay, "pid1") === "z");
    expect(v.refused).toEqual([]);
  });

  test("the stored state holds digests of the resume tokens, never a token", async () => {
    const storage = memStorage();
    const a = start(storage);
    const { presenterToken, viewerGrant } = await place(a.base, 1);
    await presenter(a.base, presenterToken);
    const v = viewer(() => a.base, viewerGrant);
    await until(() => v.state.synced && !!votes(v.doc) && !!v.resume);
    v.vote("x");
    await until(() => voteOn(a.relay, "pid1") === "x");
    await a.relay.stop();
    const own = [...storage.store].filter(([k]) => k.endsWith(".own")).map(([, b]) => new TextDecoder().decode(b));
    expect(own.length).toBeGreaterThan(0);
    expect(own.join("\n")).toContain(ownerKey(v.resume!));
    expect(own.join("\n")).not.toContain(v.resume!);
    expect(own.join("\n")).not.toContain("pid1");
  });

  test("a resume token the session never handed out is not taken", async () => {
    const storage = memStorage();
    const a = start(storage);
    const { viewerGrant } = await place(a.base, 1);
    const made = "0123456789abcdef0123456789abcdef";
    const ws = new WebSocket(`${a.base.replace("http", "ws")}/sync/s1?t=${viewerGrant}&p=p2&v=${LIVE_PROTOCOL.max}&r=${made}`);
    const notice = await new Promise<{ t: string; token: string }>((r) =>
      ws.addEventListener("message", (e) => typeof e.data === "string" && r(JSON.parse(e.data))),
    );
    ws.close();
    expect(notice.t).toBe("resume");
    expect(notice.token).not.toBe(made);
  });

  test("while a relay stores its sessions for a restart, the page is still served and a socket is told to come back", async () => {
    const storage = memStorage();
    const a = start(storage);
    const { viewerGrant } = await place(a.base, 1);
    let release!: () => void;
    storage.ctl.hold = new Promise<void>((r) => (release = r));
    const draining = a.relay.drain();
    await until(() => storage.ctl.held > 0);

    const page = await fetch(`${a.base}/s/s1?t=${viewerGrant}`);
    expect(page.status).toBe(200);
    const code = await new Promise<number>((r) => {
      const ws = new WebSocket(`${a.base.replace("http", "ws")}/sync/s1?t=${viewerGrant}&v=${LIVE_PROTOCOL.max}`);
      ws.addEventListener("close", (e) => r(e.code));
    });
    expect(code).toBe(CLOSE.RESTARTING);
    // and it takes no new talk meanwhile
    const placed = await fetch(`${a.base}/api/sessions`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "text/html" },
      body: DECK,
    });
    expect(placed.status).toBe(503);
    release();
    storage.ctl.hold = null;
    await draining;
    // still answering until it stops
    expect((await fetch(`${a.base}/s/s1?t=${viewerGrant}`)).status).toBe(200);
  });
});
