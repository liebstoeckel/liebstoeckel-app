import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import * as Y from "yjs";
import { pluginState, type ClientProps } from "@liebstoeckel/plugin-sdk";
import poll from "./client";
import { pollSchema, type PollState } from "./logic";

function clientProps(extra: Partial<ClientProps<PollState>> = {}): ClientProps<PollState> {
  const doc = new Y.Doc();
  const state = pluginState(doc, "poll", pollSchema);
  state.ensureDefaults({ question: "Best?", options: ["A", "B"] });
  return {
    doc,
    state,
    snapshot: state.snapshot(),
    role: "viewer",
    live: true,
    participantId: "view",
    theme: { viz: ["#fff"] } as unknown as ClientProps<PollState>["theme"],
    ui: {},
    props: {},
    instance: "",
    ...extra,
  };
}

describe("poll: a refused vote", () => {
  test("says in plain words that the vote did not arrive, and why", () => {
    const full = renderToStaticMarkup(<poll.client.Slide {...clientProps({ refusal: { reason: "full", at: 1 } })} />);
    expect(full).toContain("Your vote didn&#x27;t reach the presenter: the session is full.");
    const busy = renderToStaticMarkup(<poll.client.Slide {...clientProps({ refusal: { reason: "busy", at: 1 } })} />);
    expect(busy).toContain("Your vote didn&#x27;t reach the presenter. The live server is busy, try again in a moment.");
  });

  test("shows no message without a refusal", () => {
    const html = renderToStaticMarkup(<poll.client.Slide {...clientProps()} />);
    expect(html).not.toContain("reach the presenter");
    expect(html).toContain("refusal-note"); // the live region is there to announce one
  });
});

describe("poll: before the session state has arrived", () => {
  test("says it is connecting instead of showing 0 votes, and takes no vote yet", () => {
    const html = renderToStaticMarkup(<poll.client.Slide {...clientProps({ synced: false })} />);
    expect(html).toContain("connecting…");
    expect(html).not.toContain("0 votes");
    expect(html).toContain("disabled");
    const Console = poll.client.presenter!.Console;
    const console = renderToStaticMarkup(<Console {...clientProps({ synced: false, role: "presenter" })} />);
    expect(console).toContain("connecting…");
    expect(console).not.toContain("votes");
  });

  test("shows the count once synced (and outside a live session)", () => {
    expect(renderToStaticMarkup(<poll.client.Slide {...clientProps({ synced: true })} />)).toContain("0 votes");
    expect(renderToStaticMarkup(<poll.client.Slide {...clientProps()} />)).toContain("0 votes");
  });
});
