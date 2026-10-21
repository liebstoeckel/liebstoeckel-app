import { test, expect, describe, afterEach, beforeAll } from "bun:test";
import { pluginState } from "@liebstoeckel/plugin-sdk";
import { pollSchema, tally, totalVotes } from "@liebstoeckel/plugin-poll/logic";
import { connectLive } from "@liebstoeckel/engine/live";
import { startServer, extractManifest, type LiveServer } from "@liebstoeckel/live-server";
import { buildFixture } from "./harness";

// Poll-specific end-to-end: the fixture deck, built with its poll slide, served live
// and exercised through the *real* @liebstoeckel/plugin-poll. It lives here (not in
// live-server), which may depend on plugin-poll: the serving stack stays plugin-
// agnostic. No browser: a presenter and a viewer connect the way the deck's live
// client does.
let html = "";
beforeAll(async () => {
  html = await buildFixture();
}, 120_000);

describe("end-to-end: built poll deck over the live server", () => {
  let live: LiveServer | null = null;
  afterEach(() => {
    live?.stop();
    live = null;
  });

  test("manifest in the built deck lists the poll plugin", async () => {
    const m = extractManifest(html);
    expect(m).not.toBeNull();
    expect(m!.plugins.some((p) => p.name === "@liebstoeckel/plugin-poll")).toBe(true);
  });

  test("presenter + viewer vote, tally converges across clients", async () => {
    live = await startServer({ html, hostname: "127.0.0.1", publicHost: "127.0.0.1" });

    const url = (tok: string) => `ws://127.0.0.1:${live!.port}/sync?t=${tok}`;
    const presenter = connectLive(
      { ws: url(live.session.presenterToken), session: live.session.id, role: "presenter", token: live.session.presenterToken },
      "pres",
    );
    const viewer = connectLive(
      { ws: url(live.session.viewerToken), session: live.session.id, role: "viewer", token: live.session.viewerToken },
      "view",
    );
    await Promise.all([
      new Promise<void>((r) => presenter.onStatus((c) => c && r())),
      new Promise<void>((r) => viewer.onStatus((c) => c && r())),
    ]);

    // presenter seeds the poll, both cast a vote (read-only viewer can vote too)
    const ps = pluginState(presenter.doc, "poll", pollSchema);
    ps.ensureDefaults({ question: "Best?", options: ["A", "B"] });
    ps.recordSet("votes", "pres", "A");
    await Bun.sleep(60);

    const vs = pluginState(viewer.doc, "poll", pollSchema);
    expect(vs.snapshot().options).toEqual(["A", "B"]); // seed reached the viewer
    vs.recordSet("votes", "view", "B");
    await Bun.sleep(60);

    // both clients converge on 2 votes, one each
    for (const conn of [presenter, viewer]) {
      const snap = pluginState(conn.doc, "poll", pollSchema).snapshot();
      expect(totalVotes(snap)).toBe(2);
      expect(tally(snap)).toEqual([
        { option: "A", count: 1, pct: 50 },
        { option: "B", count: 1, pct: 50 },
      ]);
    }

    presenter.close();
    viewer.close();
  });
});
