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

  test("leave removes the peer", () => {
    const hub = new Hub();
    const a = hub.join(() => {});
    expect(hub.size).toBe(1);
    a.leave();
    expect(hub.size).toBe(0);
  });
});
