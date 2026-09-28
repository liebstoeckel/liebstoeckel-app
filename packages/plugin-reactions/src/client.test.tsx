import { test, expect, describe } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as Y from "yjs";
import { pluginState, type ClientProps } from "@liebstoeckel/plugin-sdk";
import reactions, { pruneReactions } from "./client";
import { reactionsSchema, EMOJI, WINDOW_MS, type ReactionsState } from "./logic";

function clientProps(): ClientProps<ReactionsState> {
  const doc = new Y.Doc();
  const state = pluginState(doc, "reactions", reactionsSchema);
  return {
    doc,
    state,
    snapshot: state.snapshot(),
    role: "viewer",
    live: true,
    participantId: "abcd1234",
    theme: { viz: ["#fff"] } as unknown as ClientProps<ReactionsState>["theme"],
    ui: {},
    props: {},
    instance: "",
  };
}

describe("reactions client renders", () => {
  test("Slide renders the emoji palette", () => {
    const html = renderToStaticMarkup(<reactions.client.Slide {...clientProps()} />);
    for (const e of EMOJI) expect(html).toContain(e);
  });

  test("fallback renders the disabled palette + hint", () => {
    const Fb = reactions.client.fallback as () => ReactElement;
    const html = renderToStaticMarkup(<Fb />);
    expect(html).toContain("offline preview");
    expect(html).toContain(EMOJI[0]!);
  });
});

describe("reactions prune", () => {
  test("deletes every expired reaction in a single update", () => {
    const doc = new Y.Doc();
    const state = pluginState(doc, "reactions", reactionsSchema);
    const now = 100_000;
    for (let i = 0; i < 30; i++) state.recordSet("reactions", `old${i}`, { emoji: "👏", pid: "p", ts: now - WINDOW_MS - 1000 });
    state.recordSet("reactions", "fresh", { emoji: "🎉", pid: "p", ts: now });
    let updates = 0;
    doc.on("update", () => updates++);
    pruneReactions(state, state.snapshot(), now);
    expect(updates).toBe(1);
    expect(Object.keys(state.snapshot().reactions)).toEqual(["fresh"]);
  });
});
