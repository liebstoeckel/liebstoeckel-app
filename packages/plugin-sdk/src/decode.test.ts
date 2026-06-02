import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import { decodePluginInstances, decodePluginState } from "./decode";
import { registerPluginInstance } from "./instances";

/** Build a snapshot like the relay would persist for a finished session. */
function snapshot(): Uint8Array {
  const d = new Y.Doc();
  const poll = d.getMap("plugin:poll");
  poll.set("question", "Best colour?");
  const opts = new Y.Array<string>();
  opts.push(["red", "blue"]);
  poll.set("options", opts);
  const votes = new Y.Map<string>();
  votes.set("p1", "red");
  votes.set("p2", "blue");
  votes.set("p3", "red");
  poll.set("votes", votes);
  poll.set("closed", true);

  registerPluginInstance(d, "poll", "");
  registerPluginInstance(d, "qa", "q1", { title: "Town hall" });
  return Y.encodeStateAsUpdate(d);
}

describe("decodePluginState", () => {
  test("round-trips a plugin slice to plain JS (nested record + array)", () => {
    const s = decodePluginState(snapshot(), "poll");
    expect(s).toEqual({
      question: "Best colour?",
      options: ["red", "blue"],
      votes: { p1: "red", p2: "blue", p3: "red" },
      closed: true,
    });
  });

  test("returns null for an absent/empty slice", () => {
    expect(decodePluginState(snapshot(), "reactions")).toBeNull();
    expect(decodePluginState(snapshot(), "poll", "nope")).toBeNull();
  });

  test("fails closed on garbage bytes", () => {
    expect(decodePluginState(new Uint8Array([9, 9, 9]), "poll")).toBeNull();
  });
});

describe("decodePluginInstances", () => {
  test("enumerates instances recorded in the index", () => {
    const list = decodePluginInstances(snapshot());
    expect(list.map((i) => `${i.type}:${i.instance}`).sort()).toEqual(["poll:", "qa:q1"]);
    expect(list.find((i) => i.instance === "q1")?.title).toBe("Town hall");
  });
});
