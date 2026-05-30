import { test, expect, describe } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as Y from "yjs";
import { pluginState, type ClientProps } from "@liebstoeckel/plugin-sdk";
import qa from "./client";
import { qaSchema, type QaState } from "./logic";

function clientProps(role: "presenter" | "viewer" = "viewer"): ClientProps<QaState> {
  const doc = new Y.Doc();
  const state = pluginState(doc, "qa", qaSchema);
  return {
    doc,
    state,
    snapshot: state.snapshot(),
    role,
    live: true,
    participantId: "abcd1234",
    theme: { viz: ["#fff"] } as unknown as ClientProps<QaState>["theme"],
    ui: {},
    props: { prompt: "Ask me anything" },
    instance: "",
  };
}

describe("qa client renders", () => {
  test("Slide shows the prompt + submit affordance", () => {
    const html = renderToStaticMarkup(<qa.client.Slide {...clientProps()} />);
    expect(html).toContain("Ask me anything");
    expect(html).toContain("Ask");
  });

  test("presenter console renders", () => {
    const Console = qa.client.presenter!.Console;
    const html = renderToStaticMarkup(<Console {...clientProps("presenter")} />);
    expect(html).toContain("Queue");
  });

  test("fallback shows offline preview with example questions", () => {
    const Fb = qa.client.fallback as (p: { snapshot: QaState; props: Record<string, unknown> }) => ReactElement;
    const html = renderToStaticMarkup(<Fb snapshot={qaSchema.default()} props={{}} />);
    expect(html).toContain("offline preview");
    expect(html).toContain("▲");
  });
});
