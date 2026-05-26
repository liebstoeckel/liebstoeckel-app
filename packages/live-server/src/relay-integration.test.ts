import { test, expect, describe, afterEach } from "bun:test";
import { createRelay, type RelayServer } from "present-relay";
import { connectLive, type LiveConnection } from "@present-it/engine/live";
import { pluginState } from "@present-it/plugin-sdk";
import { pollSchema, tally, totalVotes } from "@present-it/plugin-poll/logic";
import { embedManifest, encodeServerBundle, type PluginManifest } from "./manifest";
import { uploadDeck, runServerPluginsViaRelay, endSession, type RunnerHandle } from "./relay-client";

const TOKEN = "acct-token";
const BASE_HTML = "<html><head><title>deck</title></head><body><div id=root></div></body></html>";

let relay: RelayServer | null = null;
const closers: Array<() => void> = [];
afterEach(() => {
  for (const c of closers.splice(0)) c();
  relay?.stop();
  relay = null;
});

function startRelay() {
  relay = createRelay({ accountTokens: [TOKEN], hostname: "127.0.0.1", port: 0 });
  return `http://127.0.0.1:${relay.port}`;
}

const track = <T extends LiveConnection | RunnerHandle>(x: T): T => {
  closers.push(() => (("close" in x ? x.close : x.stop) as () => void)());
  return x;
};

async function waitUntil(fn: () => boolean, ms = 3000): Promise<void> {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error("waitUntil: timed out");
    await Bun.sleep(20);
  }
}

const SEED_DECK = embedManifest(BASE_HTML, {
  v: 1,
  plugins: [
    {
      name: "@acme/seed",
      version: "1.0.0",
      hasServer: true,
      server: encodeServerBundle(`export default (ctx) => { ctx.doc.getMap("plugin:seed").set("ready", true); };`),
    },
  ],
} satisfies PluginManifest);

describe("relay end-to-end (deck code stays local)", () => {
  test("uploadDeck rejects a bad account token", async () => {
    const base = startRelay();
    await expect(uploadDeck(base, "wrong", BASE_HTML)).rejects.toThrow(/401/);
  });

  test("runner runs server plugins locally; the effect reaches a viewer via the relay", async () => {
    const base = startRelay();
    const info = await uploadDeck(base, TOKEN, SEED_DECK);

    const runner = track(
      await runServerPluginsViaRelay({
        html: SEED_DECK,
        syncUrl: info.urls.sync,
        runnerToken: info.runnerToken,
        sessionId: info.id,
      }),
    );
    expect(runner.plugins).toEqual(["@acme/seed"]);

    // a public viewer connects to the relay and should observe the seeded state —
    // produced by the runner's server plugin, never executed on the relay itself
    const viewer = track(
      connectLive(
        { ws: `${info.urls.sync}?t=${info.viewerToken}`, session: info.id, role: "viewer", token: info.viewerToken },
        "viewer",
      ),
    );
    await waitUntil(() => viewer.doc.getMap("plugin:seed").get("ready") === true);
    expect(viewer.doc.getMap("plugin:seed").get("ready")).toBe(true);
  });

  test("no-op for a deck with no server plugins", async () => {
    const base = startRelay();
    const info = await uploadDeck(base, TOKEN, BASE_HTML);
    const runner = await runServerPluginsViaRelay({
      html: BASE_HTML,
      syncUrl: info.urls.sync,
      runnerToken: info.runnerToken,
      sessionId: info.id,
    });
    expect(runner.plugins).toEqual([]);
    runner.stop();
  });

  test("poll votes converge across two clients through the relay", async () => {
    const base = startRelay();
    const info = await uploadDeck(base, TOKEN, BASE_HTML);
    const mk = (role: "presenter" | "viewer", token: string, p: string) =>
      track(connectLive({ ws: `${info.urls.sync}?t=${token}`, session: info.id, role, token }, p));

    const presenter = mk("presenter", info.presenterToken, "pres");
    const viewer = mk("viewer", info.viewerToken, "view");
    await Promise.all([
      new Promise<void>((r) => presenter.onStatus((c) => c && r())),
      new Promise<void>((r) => viewer.onStatus((c) => c && r())),
    ]);

    const ps = pluginState(presenter.doc, "poll", pollSchema);
    ps.ensureDefaults({ question: "Best?", options: ["A", "B"] });
    ps.recordSet("votes", "pres", "A");
    await waitUntil(() => pluginState(viewer.doc, "poll", pollSchema).snapshot().options.length === 2);

    pluginState(viewer.doc, "poll", pollSchema).recordSet("votes", "view", "B");
    await waitUntil(() => totalVotes(pluginState(presenter.doc, "poll", pollSchema).snapshot()) === 2);

    for (const conn of [presenter, viewer]) {
      const snap = pluginState(conn.doc, "poll", pollSchema).snapshot();
      expect(totalVotes(snap)).toBe(2);
      expect(tally(snap)).toEqual([
        { option: "A", count: 1, pct: 50 },
        { option: "B", count: 1, pct: 50 },
      ]);
    }
  });

  test("endSession tears the session down", async () => {
    const base = startRelay();
    const info = await uploadDeck(base, TOKEN, BASE_HTML);
    expect((await fetch(`${base}/s/${info.id}?t=${info.viewerToken}`)).status).toBe(200);
    await endSession(base, TOKEN, info.id);
    expect((await fetch(`${base}/s/${info.id}?t=${info.viewerToken}`)).status).toBe(403);
  });
});
