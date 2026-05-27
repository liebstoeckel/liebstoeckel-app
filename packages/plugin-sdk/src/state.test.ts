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
});
