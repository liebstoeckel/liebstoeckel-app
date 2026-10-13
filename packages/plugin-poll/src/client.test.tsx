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

describe("poll: one tap and a confirmation", () => {
  function voted(extra: Partial<ClientProps<PollState>> = {}) {
    const p = clientProps(extra);
    p.state.recordSet("votes", "view", "B");
    return { ...p, snapshot: p.state.snapshot() };
  }

  test("options are toggle buttons: the chosen one is pressed", () => {
    const html = renderToStaticMarkup(<poll.client.Slide {...voted()} />);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
  });

  test("says the vote was received, and how to change it", () => {
    const html = renderToStaticMarkup(<poll.client.Slide {...voted({ connected: true })} />);
    expect(html).toContain("Vote received: B. Tap another option to change it.");
    // a polite status region for screen readers, never assertive
    expect(html).toContain('role="status" aria-live="polite"');
    expect(html).not.toContain("assertive");
  });

  test("says it is sending, not received, while the connection is down", () => {
    const html = renderToStaticMarkup(<poll.client.Slide {...voted({ connected: false })} />);
    expect(html).toContain("Sending your vote: B…");
    expect(html).not.toContain("Vote received");
  });

  test("no confirmation before a vote, or when the vote was refused", () => {
    expect(renderToStaticMarkup(<poll.client.Slide {...clientProps()} />)).not.toContain("poll-vote-status");
    const refused = renderToStaticMarkup(<poll.client.Slide {...voted({ refusal: { reason: "full", at: 1 } })} />);
    expect(refused).not.toContain("Vote received");
  });
});

describe("poll: results after voting", () => {
  const after = { results: "after-vote" };

  test("a viewer sees the bars only after voting", () => {
    const before = renderToStaticMarkup(<poll.client.Slide {...clientProps({ props: after })} />);
    expect(before).toContain("Results appear after you vote.");
    expect(before).not.toContain("0 · 0%");
    const p = clientProps({ props: after });
    p.state.recordSet("votes", "view", "A");
    const html = renderToStaticMarkup(<poll.client.Slide {...p} snapshot={p.state.snapshot()} />);
    expect(html).not.toContain("Results appear after you vote.");
    expect(html).toContain("1 · 100%");
  });

  test("the presenter always sees them", () => {
    const html = renderToStaticMarkup(<poll.client.Slide {...clientProps({ props: after, role: "presenter" })} />);
    expect(html).not.toContain("Results appear after you vote.");
  });

  test("by default everyone sees them", () => {
    expect(renderToStaticMarkup(<poll.client.Slide {...clientProps()} />)).not.toContain("Results appear after you vote.");
  });
});
