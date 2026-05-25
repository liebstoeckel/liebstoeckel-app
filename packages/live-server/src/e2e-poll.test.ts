import { test, expect, describe, afterEach } from "bun:test";
import { join } from "node:path";
import { pluginState } from "@present-it/plugin-sdk";
import { pollSchema, tally, totalVotes } from "@present-it/plugin-poll/logic";
import { connectLive } from "@present-it/engine/live";
import { startServer, type LiveServer } from "./server";
import { extractManifest } from "./manifest";

const BUILT = join(import.meta.dir, "../../../presentations/poll-demo/dist/index.html");

describe("end-to-end: built poll deck over the live server", () => {
  let live: LiveServer | null = null;
  afterEach(() => {
    live?.stop();
    live = null;
  });

  test("manifest in the built deck lists the poll plugin", async () => {
    const html = await Bun.file(BUILT).text();
    const m = extractManifest(html);
    expect(m).not.toBeNull();
    expect(m!.plugins.some((p) => p.name === "@present-it/plugin-poll")).toBe(true);
  });

  test("presenter + viewer vote, tally converges across clients", async () => {
    const html = await Bun.file(BUILT).text();
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
