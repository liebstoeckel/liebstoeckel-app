import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import * as Y from "yjs";
import { definePlugin, schema, t, pluginState, type ClientProps } from "@liebstoeckel/plugin-sdk";
import { readTheme } from "@liebstoeckel/plugin-ui";
import { Plugin, LiveProvider, type LiveContextValue } from "./Plugin";

const counter = definePlugin<{ n: number }>({
  id: "counter",
  state: schema({ n: t.number }),
  client: {
    Slide: (p: ClientProps<{ n: number }>) => (
      <div>
        live:{p.snapshot.n}:{p.role}:{String(p.synced)}
      </div>
    ),
    fallback: ({ snapshot }) => <div>offline:{snapshot.n}</div>,
  },
});

function ctx(over: Partial<LiveContextValue>): LiveContextValue {
  return {
    live: false,
    role: "viewer",
    participant: "p1",
    doc: new Y.Doc(),
    theme: readTheme(),
    plugins: { counter },
    ...over,
  };
}

describe("<Plugin>", () => {
  test("renders fallback when not live", () => {
    const html = renderToStaticMarkup(
      <LiveProvider value={ctx({ live: false })}>
        <Plugin id="counter" />
      </LiveProvider>,
    );
    expect(html).toContain("offline:0");
  });

  test("renders Slide with snapshot + role when live", () => {
    const doc = new Y.Doc();
    pluginState(doc, "counter", counter.state).set("n", 7);
    const html = renderToStaticMarkup(
      <LiveProvider value={ctx({ live: true, role: "presenter", doc })}>
        <Plugin id="counter" />
      </LiveProvider>,
    );
    expect(html).toContain("live:7:presenter:true");
  });

  test("passes `synced` and holds writes back until the session state arrives", () => {
    const doc = new Y.Doc();
    let synced = false;
    const cbs: Array<() => void> = [];
    const gate = {
      get synced() {
        return synced;
      },
      onSynced: (cb: () => void) => (cbs.push(cb), () => {}),
    };
    const html = renderToStaticMarkup(
      <LiveProvider value={ctx({ live: true, doc, synced: false, gate })}>
        <Plugin id="counter" />
      </LiveProvider>,
    );
    expect(html).toContain("live:0:viewer:false");
    // the engine builds plugin state with the gate: a write waits for the state
    const st = pluginState(doc, "counter", counter.state, "", gate);
    st.set("n", 3);
    expect(st.snapshot().n).toBe(0);
    synced = true;
    cbs.forEach((cb) => cb());
    expect(st.snapshot().n).toBe(3);
  });

  test("unknown plugin id renders nothing", () => {
    const html = renderToStaticMarkup(
      <LiveProvider value={ctx({})}>
        <Plugin id="nope" />
      </LiveProvider>,
    );
    expect(html).toBe("");
  });
});
