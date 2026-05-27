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
    Slide: (p: ClientProps<{ n: number }>) => <div>live:{p.snapshot.n}:{p.role}</div>,
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
    expect(html).toContain("live:7:presenter");
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
