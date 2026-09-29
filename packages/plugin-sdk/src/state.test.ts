import { test, expect, describe } from "bun:test";
import * as Y from "yjs";
import { pluginState } from "./state";
import { schema, t } from "./schema";

const pollSchema = schema({ options: t.array(t.string), votes: t.record(t.string) });

describe("pluginState over Yjs", () => {
  test("ensureDefaults seeds once", () => {
    const doc = new Y.Doc();
    const st = pluginState(doc, "poll", pollSchema);
    expect(st.snapshot()).toEqual({ options: [], votes: {} });
    st.ensureDefaults({ options: ["A", "B", "C"] });
    expect(st.snapshot()).toEqual({ options: ["A", "B", "C"], votes: {} });
    // does not overwrite when already populated
    st.ensureDefaults({ options: ["X"] });
    expect(st.snapshot().options).toEqual(["A", "B", "C"]);
  });

  test("set replaces a field; recordSet merges entries", () => {
    const doc = new Y.Doc();
    const st = pluginState(doc, "poll", pollSchema);
    st.ensureDefaults({ options: ["A", "B"] });
    st.recordSet("votes", "p1", "A");
    st.recordSet("votes", "p2", "B");
    st.recordSet("votes", "p1", "B"); // change own vote
    expect(st.snapshot().votes).toEqual({ p1: "B", p2: "B" });
    st.recordDelete("votes", "p2");
    expect(st.snapshot().votes).toEqual({ p1: "B" });
  });

  test("subscribe fires on change", () => {
    const doc = new Y.Doc();
    const st = pluginState(doc, "poll", pollSchema);
    let calls = 0;
    let last: unknown;
    const off = st.subscribe((s) => {
      calls++;
      last = s;
    });
    st.recordSet("votes", "p1", "A");
    expect(calls).toBeGreaterThan(0);
    expect((last as { votes: Record<string, string> }).votes).toEqual({ p1: "A" });
    off();
    const before = calls;
    st.recordSet("votes", "p2", "B");
    expect(calls).toBe(before); // no longer observing
  });

  test("two docs converge via Yjs updates (concurrent votes merge)", () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const sa = pluginState(a, "poll", pollSchema);
    const sb = pluginState(b, "poll", pollSchema);
    sa.ensureDefaults({ options: ["A", "B"] });
    // sync a → b
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    // concurrent votes on each side
    sa.recordSet("votes", "p1", "A");
    sb.recordSet("votes", "p2", "B");
    // exchange updates both ways
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
    expect(sa.snapshot().votes).toEqual({ p1: "A", p2: "B" });
    expect(sb.snapshot().votes).toEqual({ p1: "A", p2: "B" });
  });

  test("instances of one type are independent; default stays at the old address ((internal ADR))", () => {
    const doc = new Y.Doc();
    const def = pluginState(doc, "poll", pollSchema); // default instance
    const lunch = pluginState(doc, "poll", pollSchema, "lunch");
    const dinner = pluginState(doc, "poll", pollSchema, "dinner");

    def.ensureDefaults({ options: ["x"] });
    lunch.recordSet("votes", "p1", "A");
    dinner.recordSet("votes", "p1", "B");

    // each slice is isolated
    expect(lunch.snapshot().votes).toEqual({ p1: "A" });
    expect(dinner.snapshot().votes).toEqual({ p1: "B" });
    expect(def.snapshot().votes).toEqual({});

    // the default keeps the pre-instances address; named instances are suffixed
    expect([...doc.share.keys()]).toContain("plugin:poll");
    expect([...doc.share.keys()]).toContain("plugin:poll:lunch");
    expect([...doc.share.keys()]).toContain("plugin:poll:dinner");
  });
});

/** A sync gate the test opens by hand, as the live connection does on the first state. */
function manualGate() {
  let synced = false;
  const cbs: Array<() => void> = [];
  return {
    get synced() {
      return synced;
    },
    onSynced(cb: () => void) {
      if (synced) cb();
      else cbs.push(cb);
      return () => {};
    },
    open() {
      synced = true;
      cbs.splice(0).forEach((cb) => cb());
    },
  };
}

/** Two docs exchange everything they have, both ways. */
function exchange(a: Y.Doc, b: Y.Doc) {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
}

describe("pluginState before the live session state has arrived", () => {
  const qaSchema = schema({ questions: t.record(t.string), votes: t.record(t.string) });

  // The session already has votes; a client (the presenter tab opening) mounts with an
  // empty doc. Run many times: without the gate, which of two concurrent maps at the
  // same key wins depends on the random client ids.
  test("seeding defaults before the state arrives never replaces the session's votes", () => {
    for (let i = 0; i < 40; i++) {
      const session = new Y.Doc();
      const seeded = pluginState(session, "poll", pollSchema);
      seeded.ensureDefaults({ options: ["A", "B"] });
      seeded.recordSet("votes", "p1", "A");
      seeded.recordSet("votes", "p2", "B");

      const presenter = new Y.Doc();
      const gate = manualGate();
      const st = pluginState(presenter, "poll", pollSchema, "", gate);
      st.ensureDefaults({ options: ["A", "B"] }); // what the poll's seed does on mount
      expect(presenter.getMap("plugin:poll").size).toBe(0); // held back

      Y.applyUpdate(presenter, Y.encodeStateAsUpdate(session)); // the server's state
      gate.open();
      exchange(presenter, session);
      expect(seeded.snapshot().votes).toEqual({ p1: "A", p2: "B" });
      expect(st.snapshot().votes).toEqual({ p1: "A", p2: "B" });
    }
  });

  test("defaults are still written once the state arrives, when the session has none", () => {
    const doc = new Y.Doc();
    const gate = manualGate();
    const st = pluginState(doc, "poll", pollSchema, "", gate);
    st.ensureDefaults({ options: ["A", "B"] });
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(new Y.Doc())); // an empty session
    gate.open();
    expect(st.snapshot()).toEqual({ options: ["A", "B"], votes: {} });
  });

  test("a question or vote written before the state arrives joins the session's map instead of replacing it", () => {
    for (let i = 0; i < 40; i++) {
      const session = new Y.Doc();
      const s = pluginState(session, "qa", qaSchema);
      s.recordSet("questions", "q1", "first?");
      s.recordSet("votes", "q1:p1", "1");

      const viewer = new Y.Doc();
      const gate = manualGate();
      const v = pluginState(viewer, "qa", qaSchema, "", gate);
      v.recordSet("questions", "q2", "second?");
      v.recordSet("votes", "q1:p2", "1");
      v.recordDelete("votes", "q1:p1");
      expect(viewer.getMap("plugin:qa").size).toBe(0);

      Y.applyUpdate(viewer, Y.encodeStateAsUpdate(session));
      gate.open();
      exchange(viewer, session);
      // held writes run in order, on the session's maps
      expect(s.snapshot().questions).toEqual({ q1: "first?", q2: "second?" });
      expect(s.snapshot().votes).toEqual({ "q1:p2": "1" });
    }
  });

  test("once synced, writes go out at once", () => {
    const doc = new Y.Doc();
    const gate = manualGate();
    gate.open();
    const st = pluginState(doc, "poll", pollSchema, "", gate);
    st.recordSet("votes", "p1", "A");
    expect(st.snapshot().votes).toEqual({ p1: "A" });
  });
});
