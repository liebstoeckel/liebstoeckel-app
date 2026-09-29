import { test, expect, describe, afterEach, setDefaultTimeout } from "bun:test";
import * as Y from "yjs";
import { createRelay, type RelayServer } from "./relay-server";

// What the relay tells clients about refused audience writes (protocol 2): the viewer
// whose write was refused gets `refused` (reason + roots), then `reset` and the whole
// session state; presenters get `refusing` while a field is full or memory is short.
// Clients on protocol 1 get none of it.

const TOKEN = "acct-secret-token";
const MANIFEST = JSON.stringify({
  v: 1,
  plugins: [{ name: "poll", version: "0", hasServer: false, id: "poll", audienceWrites: ["votes"] }],
});
const DECK =
  `<!doctype html><html><head><title>deck</title></head><body><div id=root></div>` +
  `<script type="application/json" data-liebstoeckel-plugins>${MANIFEST}</script></body></html>`;

let relay: RelayServer | null = null;
afterEach(async () => {
  await relay?.stop();
  relay = null;
});

type Frame = { text: string } | { bytes: Uint8Array };

/** A raw socket that records every frame, text and binary, after the initial state. */
async function connect(url: string) {
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";
  const frames: Frame[] = [];
  const doc = new Y.Doc();
  let first = true;
  ws.addEventListener("message", (e) => {
    if (typeof e.data === "string") return void frames.push({ text: e.data });
    const bytes = new Uint8Array(e.data as ArrayBuffer);
    if (first) {
      first = false;
      Y.applyUpdate(doc, bytes);
      return;
    }
    frames.push({ bytes });
  });
  await new Promise<void>((res, rej) => {
    ws.addEventListener("open", () => res());
    ws.addEventListener("error", rej);
  });
  while (first) await Bun.sleep(5);
  const texts = () => frames.flatMap((f) => ("text" in f ? [JSON.parse(f.text) as Record<string, unknown>] : []));
  /** Send a change made on this socket's own copy of the doc. */
  const write = (change: (d: Y.Doc) => void) => {
    const before = Y.encodeStateVector(doc);
    change(doc);
    ws.send(new Uint8Array(Y.encodeStateAsUpdate(doc, before)));
  };
  return { ws, frames, texts, doc, write };
}

async function start(opts: Partial<Parameters<typeof createRelay>[0]> = {}) {
  relay = createRelay({ accountTokens: [TOKEN], hostname: "127.0.0.1", port: 0, resetMinGapMs: 0, ...opts });
  const res = await fetch(`http://127.0.0.1:${relay.port}/api/sessions`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "text/html", "x-live-enforce": "1" },
    body: DECK,
  });
  const { id, presenterToken, viewerToken } = (await res.json()) as Record<string, string>;
  const base = `ws://127.0.0.1:${relay.port}/sync/${id}`;
  const presenter = await connect(`${base}?t=${presenterToken}&v=2`);
  // the presenter sets up the poll's votes map, as the poll plugin does
  presenter.write((d) => d.getMap("plugin:poll").set("votes", new Y.Map()));
  await settle();
  return {
    presenter,
    viewer: (v: number | null = 2, extra = "") =>
      connect(`${base}?t=${viewerToken}${v === null ? "" : `&v=${v}`}${extra}`),
  };
}

const settle = (ms = 120) => Bun.sleep(ms);
const vote = (pid: string, option: string) => (d: Y.Doc) =>
  (d.getMap("plugin:poll").get("votes") as Y.Map<string>).set(pid, option);


// real sockets and timers: give a busy CI host room
setDefaultTimeout(20_000);

describe("refused audience writes: what the relay sends", () => {
  test("an accepted write sends the viewer no notice", async () => {
    const s = await start();
    const v = await s.viewer();
    await settle();
    v.write(vote("p1", "A"));
    await settle();
    expect(v.texts()).toEqual([]);
    expect(s.presenter.texts()).toEqual([]);
  });

  test("out of scope: `refused` (invalid) with the root, then `reset` and the state; no presenter notice", async () => {
    const s = await start();
    const v = await s.viewer();
    v.write((d) => d.getMap("deck").set("index", 9));
    await settle();
    expect(v.texts()).toEqual([{ t: "refused", reason: "invalid", roots: ["deck"] }, { t: "reset" }]);
    // the frame after `reset` is the whole state, without the refused write
    const i = v.frames.findIndex((f) => "text" in f && f.text.includes("reset"));
    const state = v.frames[i + 1];
    expect(state && "bytes" in state).toBe(true);
    const doc = new Y.Doc();
    Y.applyUpdate(doc, (state as { bytes: Uint8Array }).bytes);
    expect(doc.getMap("deck").get("index")).toBeUndefined();
    expect(doc.getMap("plugin:poll").get("votes")).toBeInstanceOf(Y.Map);
    expect(s.presenter.texts()).toEqual([]);
  });

  test("out of bounds: `refused` (invalid)", async () => {
    const s = await start();
    const v = await s.viewer();
    v.write(vote("p1", "x".repeat(5000)));
    await settle();
    expect(v.texts()[0]).toEqual({ t: "refused", reason: "invalid", roots: ["plugin:poll"] });
  });

  test("a full field: `refused` (full); presenters, not viewers, get `refusing` until a quiet spell", async () => {
    const s = await start({ audienceEntryCap: 1, refusingQuietMs: 300 });
    const v = await s.viewer();
    const bystander = await s.viewer();
    v.write(vote("p1", "A")); // fills the field
    await settle();
    v.write(vote("p2", "B"));
    await settle();
    expect(v.texts()).toEqual([{ t: "refused", reason: "full", roots: ["plugin:poll"] }, { t: "reset" }]);
    expect(s.presenter.texts()).toEqual([{ t: "refusing", reason: "full" }]);
    expect(bystander.texts()).toEqual([]);
    // a presenter who joins now hears it at once
    const late = await connect(s.presenter.ws.url);
    await settle(30);
    expect(late.texts()).toEqual([{ t: "refusing", reason: "full" }]);
    await settle(400);
    expect(s.presenter.texts()).toEqual([
      { t: "refusing", reason: "full" },
      { t: "refusing", reason: null },
    ]);
  });

  test("memory stop: `refused` (busy); the next accepted write clears the presenter notice at once", async () => {
    let room = false;
    const s = await start({ admitAudience: () => room, refusingQuietMs: 60_000 });
    const v = await s.viewer();
    v.write(vote("p1", "A"));
    await settle();
    expect(v.texts()[0]).toEqual({ t: "refused", reason: "busy", roots: ["plugin:poll"] });
    expect(s.presenter.texts()).toEqual([{ t: "refusing", reason: "busy" }]);
    room = true;
    const fresh = await s.viewer();
    fresh.write(vote("p9", "B"));
    await settle();
    expect(fresh.texts()).toEqual([]);
    expect(s.presenter.texts()).toEqual([
      { t: "refusing", reason: "busy" },
      { t: "refusing", reason: null },
    ]);
  });

  test("a refused update that only deletes gets no notice and no state", async () => {
    let room = true;
    const s = await start({ admitAudience: () => room });
    const v = await s.viewer();
    v.write(vote("p1", "A"));
    await settle();
    room = false;
    v.write((d) => (d.getMap("plugin:poll").get("votes") as Y.Map<string>).delete("p1"));
    await settle();
    expect(v.texts()).toEqual([]);
    expect(v.frames.filter((f) => "bytes" in f && f.bytes.byteLength > 2)).toEqual([]);
  });

  test("states after refusals are spaced out per viewer", async () => {
    const s = await start({ admitAudience: () => false, resetMinGapMs: 300 });
    const v = await s.viewer();
    v.write(vote("p1", "A"));
    v.write(vote("p1", "B"));
    v.write(vote("p1", "C"));
    await settle(100);
    const resets = () => v.texts().filter((m) => m.t === "reset").length;
    expect(v.texts().filter((m) => m.t === "refused").length).toBe(3);
    expect(resets()).toBe(1);
    await settle(350);
    expect(resets()).toBe(2); // the later refusals share one
  });

  test("a protocol 1 client gets exactly what it got before: no text frames, no extra state", async () => {
    for (const version of [null, 1]) {
      const s = await start({ audienceEntryCap: 1 });
      const old = await s.viewer(version);
      old.write(vote("p1", "A"));
      await settle();
      old.write((d) => d.getMap("deck").set("index", 3));
      old.write(vote("p2", "B")); // over the cap
      await settle();
      expect(old.frames).toEqual([]);
      await relay!.stop();
      relay = null;
    }
  });
});

describe("viewers' Yjs client ids (protocol 3 resume token)", () => {
  const resumeOf = (v: { texts: () => Record<string, unknown>[] }) =>
    v.texts().find((m) => m.t === "resume")?.token as string | undefined;
  /** The session's votes, as a presenter joining now gets them. */
  const votesOf = async (presenter: { ws: WebSocket }) => {
    const peek = await connect(presenter.ws.url);
    peek.ws.close();
    return (peek.doc.getMap("plugin:poll").get("votes") as Y.Map<string>).toJSON();
  };

  test("a protocol 3 viewer gets a resume token; older ones do not", async () => {
    const s = await start();
    const v3 = await s.viewer(3);
    const v2 = await s.viewer(2);
    await settle(30);
    expect(resumeOf(v3)).toMatch(/^[0-9a-f]{32}$/);
    expect(v2.texts()).toEqual([]);
  });

  test("with its token, a reconnect delivers a vote the last connection never sent; a guessed token gets nothing", async () => {
    const s = await start();
    const v = await s.viewer(3, "&p=alice");
    await settle(30);
    const token = resumeOf(v)!;
    v.write(vote("alice", "A"));
    await settle();
    // a vote made on the dying connection, never sent: it is in the doc under the old id
    (v.doc.getMap("plugin:poll").get("votes") as Y.Map<string>).set("alice", "B");
    v.ws.close();
    await settle(30);
    // a stranger with a made-up token cannot bring it in either
    const stranger = await s.viewer(3, `&p=alice&r=${"0".repeat(32)}`);
    stranger.ws.send(new Uint8Array(Y.encodeStateAsUpdate(v.doc)));
    await settle();
    // (its delete set still applies: deleting an entry is something any viewer may do)
    expect((await votesOf(s.presenter)).alice).not.toBe("B");
    expect(resumeOf(stranger)).not.toBe(token);
    // the client itself, back with its token and a fresh client id, resyncs
    const back = await s.viewer(3, `&p=alice&r=${token}`);
    await settle(30);
    expect(resumeOf(back)).toBe(token);
    const resync = new Y.Doc();
    Y.applyUpdate(resync, Y.encodeStateAsUpdate(v.doc));
    back.ws.send(new Uint8Array(Y.encodeStateAsUpdate(resync)));
    await settle();
    expect(await votesOf(s.presenter)).toEqual({ alice: "B" });
    expect(back.texts().filter((m) => m.t !== "resume")).toEqual([]);
  });

  test("an old deck's viewer (keeps its client id) keeps working after it reconnects", async () => {
    for (const version of [null, 2]) {
      const s = await start();
      const doc = new Y.Doc();
      const first = await s.viewer(version, "&p=bob");
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(first.doc));
      const send = (w: WebSocket, change: (d: Y.Doc) => void) => {
        const sv = Y.encodeStateVector(doc);
        change(doc);
        w.send(new Uint8Array(Y.encodeStateAsUpdate(doc, sv)));
      };
      send(first.ws, vote("bob", "A"));
      await settle();
      first.ws.close();
      const again = await s.viewer(version, "&p=bob");
      again.ws.send(new Uint8Array(Y.encodeStateAsUpdate(doc))); // its resync, same client id
      send(again.ws, vote("bob", "B"));
      await settle();
      expect(await votesOf(s.presenter)).toEqual({ bob: "B" });
      expect(again.texts()).toEqual([]);
      await relay!.stop();
      relay = null;
    }
  });
});
