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
