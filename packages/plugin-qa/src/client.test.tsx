import { test, expect, describe } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as Y from "yjs";
import { pluginState, type ClientProps } from "@liebstoeckel/plugin-sdk";
import qa from "./client";
import { qaSchema, type QaState } from "./logic";

function clientProps(role: "presenter" | "viewer" = "viewer", audienceInputKeptDays?: number): ClientProps<QaState> {
  const doc = new Y.Doc();
  const state = pluginState(doc, "qa", qaSchema);
  return {
    doc,
    state,
    snapshot: state.snapshot(),
    role,
    live: true,
    participantId: "abcd1234",
    audienceInputKeptDays,
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

  test("the ask box says questions may be saved only when the session keeps them", () => {
    const kept = renderToStaticMarkup(<qa.client.Slide {...clientProps("viewer", 365)} />);
    expect(kept).toContain("may be saved by the presenter&#x27;s organisation for up to a year");
    const Panel = qa.client.global!.Panel!;
    const panelHtml = renderToStaticMarkup(
      <Panel {...clientProps("viewer", 365)} panel={{ open: true, toggle: () => {}, close: () => {} }} />,
    );
    expect(panelHtml).toContain("qa-kept-hint");
    expect(renderToStaticMarkup(<qa.client.Slide {...clientProps("viewer")} />)).not.toContain("qa-kept-hint");
    expect(renderToStaticMarkup(<qa.client.Slide {...clientProps("viewer", 0)} />)).not.toContain("qa-kept-hint");
  });
});
