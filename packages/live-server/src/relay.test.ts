import { test, expect, describe } from "bun:test";
import * as Y from "yjs";
import { Hub } from "./relay";

describe("Hub (Yjs relay)", () => {
  test("newcomers get full state; updates broadcast to others, not the sender", () => {
    const hub = new Hub();
    const aMsgs: Uint8Array[] = [];
    const bMsgs: Uint8Array[] = [];
    const a = hub.join((d) => aMsgs.push(d));
    const b = hub.join((d) => bMsgs.push(d));
    expect(hub.size).toBe(2);
    expect(aMsgs.length).toBe(1); // full-state on join
    expect(bMsgs.length).toBe(1);

    // an update produced elsewhere, fed in via peer A
    const ext = new Y.Doc();
    ext.getMap("plugin:poll").set("x", 1);
    const update = Y.encodeStateAsUpdate(ext);

    const aBefore = aMsgs.length;
    const bBefore = bMsgs.length;
    a.recv(update);

    expect(hub.doc.getMap("plugin:poll").get("x")).toBe(1); // applied to shared doc
    expect(bMsgs.length).toBe(bBefore + 1); // broadcast to B
    expect(aMsgs.length).toBe(aBefore); // not echoed to sender
  });

  test("late joiner receives state containing prior changes", () => {
    const hub = new Hub();
    const a = hub.join(() => {});
    const ext = new Y.Doc();
    ext.getMap("plugin:poll").set("votes", "loaded");
    a.recv(Y.encodeStateAsUpdate(ext));

    const cMsgs: Uint8Array[] = [];
    hub.join((d) => cMsgs.push(d));
    const mirror = new Y.Doc();
    Y.applyUpdate(mirror, cMsgs[0]!);
    expect(mirror.getMap("plugin:poll").get("votes")).toBe("loaded");
  });

  test("a malformed update from a peer is ignored, not thrown", () => {
    const hub = new Hub();
    const a = hub.join(() => {});
    expect(() => a.recv(new Uint8Array([1, 2, 3, 255, 99, 7]))).not.toThrow();
    // the relay still works afterward
    const ext = new Y.Doc();
    ext.getMap("plugin:poll").set("ok", true);
    a.recv(Y.encodeStateAsUpdate(ext));
    expect(hub.doc.getMap("plugin:poll").get("ok")).toBe(true);
  });

  test("a peer whose send throws is dropped; others still receive the update", () => {
    const hub = new Hub();
    let aCalls = 0;
    hub.join(() => {
      aCalls++;
      if (aCalls > 1) throw new Error("dead socket"); // join ok, later broadcast throws
    });
    const cMsgs: Uint8Array[] = [];
    hub.join((d) => cMsgs.push(d));
    expect(hub.size).toBe(2);

    const ext = new Y.Doc();
    ext.getMap("m").set("k", 1);
    Y.applyUpdate(hub.doc, Y.encodeStateAsUpdate(ext)); // origin=undefined → broadcast to all

    expect(hub.doc.getMap("m").get("k")).toBe(1);
    expect(cMsgs.length).toBeGreaterThanOrEqual(2); // c still got the broadcast despite a throwing
    expect(hub.size).toBe(1); // a was dropped
  });

  test("keepalive sends benign no-op frames to peers", async () => {
    const hub = new Hub({ keepaliveMs: 20 });
    const msgs: Uint8Array[] = [];
    hub.join((d) => msgs.push(d)); // full-state on join
    await Bun.sleep(80);
    expect(msgs.length).toBeGreaterThan(1); // received keepalives
    const mirror = new Y.Doc();
    expect(() => Y.applyUpdate(mirror, msgs[msgs.length - 1]!)).not.toThrow();
    expect(mirror.getMap("x").size).toBe(0); // keepalive mutates nothing
    hub.destroy();
  });

  test("leave removes the peer", () => {
    const hub = new Hub();
    const a = hub.join(() => {});
    expect(hub.size).toBe(1);
    a.leave();
    expect(hub.size).toBe(0);
  });
});

describe("Hub snapshot/seed round-trip (re-provision continuity, (internal ticket))", () => {
  test("seed restores a prior snapshot's doc state into a fresh Hub", () => {
    const a = new Hub();
    const local = new Y.Doc();
    local.getMap("deck").set("index", 7);
    local.getMap("plugin:poll").set("votes", 3);
    a.join(() => {}).recv(new Uint8Array(Y.encodeStateAsUpdate(local)));
    const snap = a.snapshot();
    a.destroy();

    // a brand-new Hub on a "new pod" seeded from the snapshot carries the same state, // the audience's poll/Q&A survives a re-provision ((internal ADR) §5).
    const b = new Hub();
    b.seed(snap);
    const out = new Y.Doc();
    Y.applyUpdate(out, b.snapshot());
    expect(out.getMap("deck").get("index")).toBe(7);
    expect(out.getMap("plugin:poll").get("votes")).toBe(3);
    b.destroy();
  });
});

describe("Hub, refused audience updates", () => {
  const scope = { pluginFields: new Map([["poll", new Set(["votes"])]]), wholeRoots: new Set<string>() };

  /** An enforced hub with the presenter's poll already in it, and a viewer joined. */
  function setup(rate?: { capacity: number; refillPerSec: number }, admit?: () => boolean) {
    const hub = new Hub({ audience: { scope, rate, admit } });
    const presenter = new Y.Doc();
    presenter.getMap("plugin:poll").set("question", "Best?");
    presenter.getMap("nav").set("slide", 1);
    hub.join(() => {}).recv(Y.encodeStateAsUpdate(presenter));
    const drops: Array<[string, boolean]> = [];
    const toViewer: Uint8Array[] = [];
    const peer = hub.join((d) => toViewer.push(d), "audience", {
      onDrop: (reason, { tombstoned }) => drops.push([reason, tombstoned]),
    });
    const viewer = new Y.Doc();
    Y.applyUpdate(viewer, toViewer[0]!);
    const frames: Uint8Array[] = [];
    viewer.on("update", (u: Uint8Array) => frames.push(u));
    const votes = () => (hub.doc.getMap("plugin:poll").get("votes") as Y.Map<string> | undefined)?.toJSON();
    const vote = (k: string, v: string) =>
      viewer.transact(() => {
        const poll = viewer.getMap("plugin:poll");
        let m = poll.get("votes") as Y.Map<string> | undefined;
        if (!m) poll.set("votes", (m = new Y.Map()));
        m.set(k, v);
      });
    return { hub, peer, viewer, frames, drops, votes, vote };
  }

  test("a rate drop reports `rate` and ignores the peer until it reconnects; the resync then applies", () => {
    const { hub, peer, viewer, frames, drops, votes, vote } = setup({ capacity: 1, refillPerSec: 0 });
    vote("a", "A");
    vote("b", "B");
    peer.recv(frames[0]!);
    peer.recv(frames[1]!); // over the limit
    expect(drops).toEqual([["rate", false]]);
    expect(votes()).toEqual({ a: "A" });
    // on the same connection nothing more is read
    vote("c", "C");
    peer.recv(frames[2]!);
    expect(votes()).toEqual({ a: "A" });
    // the reconnect resends the whole state in one update
    peer.leave();
    const again = hub.join(() => {}, "audience");
    again.recv(Y.encodeStateAsUpdate(viewer));
    expect(votes()).toEqual({ a: "A", b: "B", c: "C" });
  });

  test("an out-of-scope write is never applied, and the viewer's later votes still arrive", () => {
    const { hub, peer, viewer, frames, drops, votes, vote } = setup();
    vote("a", "A");
    viewer.getMap("nav").set("slide", 99); // presenter-only
    vote("a", "B");
    for (const f of frames) peer.recv(f);
    expect(drops).toEqual([["scope", true]]);
    expect(hub.doc.getMap("nav").get("slide")).toBe(1);
    expect(votes()).toEqual({ a: "B" });
    expect(hub.doc.store.pendingStructs).toBeNull();
    // a resync after a reconnect stays refused for the presenter-only part
    const again = hub.join(() => {}, "audience");
    again.recv(Y.encodeStateAsUpdate(viewer));
    expect(hub.doc.getMap("nav").get("slide")).toBe(1);
  });

  test("placeholders are never placed over another peer's clocks", () => {
    const { hub, viewer, frames, votes, vote } = setup();
    vote("a", "A");
    const first = hub.join(() => {}, "audience");
    first.recv(frames[0]!); // `first` brought the viewer's client id in
    // a second connection sends a refused write under that id: dropped, no placeholder
    viewer.getMap("nav").set("slide", 99);
    const drops: boolean[] = [];
    const other = hub.join(() => {}, "audience", { onDrop: (_r, { tombstoned }) => drops.push(tombstoned) });
    other.recv(frames[1]!);
    expect(drops).toEqual([false]);
    // the relay's clock for that id did not move past what `first` sent
    expect(Y.getState(hub.doc.store, viewer.clientID)).toBe(Y.parseUpdateMeta(frames[0]!).to.get(viewer.clientID)!);
    expect(votes()).toEqual({ a: "A" });
  });

  test("an update that would wait for missing clocks is refused, so nothing is parked unchecked", () => {
    const { hub, peer, viewer, frames, drops } = setup();
    viewer.getMap("nav").set("slide", 50); // refused, not sent yet
    viewer.getMap("nav").set("slide", 60); // would sit behind the gap
    peer.recv(frames[1]!);
    expect(drops).toEqual([["scope", false]]);
    expect(hub.doc.store.pendingStructs).toBeNull();
    peer.recv(frames[0]!);
    expect(drops).toEqual([["scope", false], ["scope", true]]);
    expect(hub.doc.getMap("nav").get("slide")).toBe(1);
    expect(hub.doc.store.pendingStructs).toBeNull();
  });

  test("while the relay has no room, audience writes are refused as `full` and later ones still apply", () => {
    let room = true;
    const { frames, peer, drops, votes, vote } = setup(undefined, () => room);
    vote("a", "A");
    peer.recv(frames[0]!);
    room = false;
    vote("b", "B");
    peer.recv(frames[1]!);
    expect(drops).toEqual([["full", true]]);
    expect(votes()).toEqual({ a: "A" });
    room = true;
    vote("c", "C");
    peer.recv(frames[2]!);
    expect(votes()).toEqual({ a: "A", c: "C" });
  });
});

describe("Hub, a large audience", () => {
  test("a few thousand voters: every vote applies, each within a few ms", () => {
    const scope = { pluginFields: new Map([["poll", new Set(["votes"])]]), wholeRoots: new Set<string>() };
    const hub = new Hub({ audience: { scope } });
    const presenter = new Y.Doc();
    presenter.getMap("plugin:poll").set("question", "Best?");
    presenter.getMap("plugin:poll").set("votes", new Y.Map());
    hub.join(() => {}).recv(Y.encodeStateAsUpdate(presenter));
    const base = Y.encodeStateAsUpdate(hub.doc);
    const voters = 4000;
    // each viewer's first vote, built against the state it joined with
    const frames = Array.from({ length: voters }, (_, i) => {
      const v = new Y.Doc();
      Y.applyUpdate(v, base);
      const sv = Y.encodeStateVector(v);
      (v.getMap("plugin:poll").get("votes") as Y.Map<string>).set(`viewer-${i}`, i % 2 ? "red" : "blue");
      return Y.encodeStateAsUpdate(v, sv);
    });
    const peers = Array.from({ length: 8 }, () => hub.join(() => {}, "audience"));
    const time = (from: number, to: number) => {
      const t = performance.now();
      for (let i = from; i < to; i++) peers[i % peers.length]!.recv(frames[i]!);
      return (performance.now() - t) / (to - from);
    };
    const early = time(0, 200);
    time(200, voters - 200);
    const late = time(voters - 200, voters);
    expect((hub.doc.getMap("plugin:poll").get("votes") as Y.Map<string>).size).toBe(voters);
    console.log(`per vote: ${early.toFixed(3)} ms early, ${late.toFixed(3)} ms at ${voters} voters`);
    // The old whole-doc check cost ~20 ms per vote at 1000 voters and grew with the doc.
    // What is left grows with the number of Yjs clients (one per viewer) inside Yjs
    // itself, a few ms at this size. Loose bound, so a slow CI host does not flake.
    expect(late).toBeLessThan(20);
    hub.destroy();
  }, 60_000);
});
