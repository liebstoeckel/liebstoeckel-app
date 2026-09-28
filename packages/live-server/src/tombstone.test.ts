import { test, expect, describe } from "bun:test";
import * as Y from "yjs";
import { newRanges, tombstoneUpdate } from "./tombstone";

const state = (doc: Y.Doc) => Y.decodeStateVector(Y.encodeStateVector(doc));

describe("tombstone", () => {
  test("encodes placeholders Yjs reads back as garbage-collected ranges", () => {
    const bytes = tombstoneUpdate([
      { client: 7, clock: 3, length: 2 },
      { client: 2 ** 32 - 1, clock: 300, length: 1000 },
    ]);
    const { structs, ds } = Y.decodeUpdate(bytes);
    expect(structs.map((s) => [s.constructor.name, s.id.client, s.id.clock, s.length])).toEqual([
      ["GC", 7, 3, 2],
      ["GC", 2 ** 32 - 1, 300, 1000],
    ]);
    expect(ds.clients.size).toBe(0);
  });

  test("the ranges an update adds skip what the doc already has", () => {
    const relay = new Y.Doc();
    const viewer = new Y.Doc();
    const frames: Uint8Array[] = [];
    viewer.on("update", (u: Uint8Array) => frames.push(u));
    viewer.getMap("a").set("x", 1);
    viewer.getMap("a").set("y", 2);
    Y.applyUpdate(relay, frames[0]!);
    expect(newRanges(frames[1]!, state(relay))).toEqual([{ client: viewer.clientID, clock: 1, length: 1 }]);
    // a full-state resync adds only the clock the relay lacks
    expect(newRanges(Y.encodeStateAsUpdate(viewer), state(relay))).toEqual([{ client: viewer.clientID, clock: 1, length: 1 }]);
    Y.applyUpdate(relay, frames[1]!);
    expect(newRanges(Y.encodeStateAsUpdate(viewer), state(relay))).toEqual([]);
  });

  test("a refused write is never applied, and the same client's later writes apply", () => {
    const relay = new Y.Doc();
    const presenter = new Y.Doc();
    presenter.getMap("nav").set("slide", 1);
    Y.applyUpdate(relay, Y.encodeStateAsUpdate(presenter));
    const viewer = new Y.Doc();
    Y.applyUpdate(viewer, Y.encodeStateAsUpdate(relay));
    const frames: Uint8Array[] = [];
    viewer.on("update", (u: Uint8Array) => frames.push(u));

    viewer.getMap("nav").set("slide", 99); // refused
    viewer.getMap("poll").set("vote", "a"); // allowed
    viewer.getMap("nav").set("slide", 100); // refused, built on the first refused write
    viewer.getMap("poll").set("vote", "b"); // allowed, overwrites the earlier vote

    const refuse = (f: Uint8Array) => Y.applyUpdate(relay, tombstoneUpdate(newRanges(f, state(relay))));
    refuse(frames[0]!);
    Y.applyUpdate(relay, frames[1]!);
    refuse(frames[2]!);
    Y.applyUpdate(relay, frames[3]!);

    expect(relay.getMap("nav").toJSON()).toEqual({ slide: 1 });
    expect(relay.getMap("poll").toJSON()).toEqual({ vote: "b" });
    expect(relay.store.pendingStructs).toBeNull();
    // a newcomer sees the same
    const late = new Y.Doc();
    Y.applyUpdate(late, Y.encodeStateAsUpdate(relay));
    expect(late.getMap("nav").toJSON()).toEqual({ slide: 1 });
    expect(late.getMap("poll").toJSON()).toEqual({ vote: "b" });
  });
});
