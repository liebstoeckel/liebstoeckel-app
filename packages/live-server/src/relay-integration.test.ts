import { test, expect, describe, afterEach } from "bun:test";
// Relative import (not the `@liebstoeckel/present-relay` package name) on purpose:
// present-relay depends on live-server, so declaring present-relay as a live-server
// (dev)dependency would re-form the release-please workspace cycle. This is a
// test-only reach into the sibling to exercise the relay↔live-server integration.
import { createRelay, type RelayServer } from "../../present-relay/src/index.ts";
import { connectLive, type LiveConnection } from "@liebstoeckel/engine/live";
import { pluginState, schema, t } from "@liebstoeckel/plugin-sdk";
import { embedManifest, encodeServerBundle, type PluginManifest } from "./manifest";
import { uploadDeck, runServerPluginsViaRelay, endSession, type RunnerHandle } from "./relay-client";

const TOKEN = "acct-token";
const BASE_HTML = "<html><head><title>deck</title></head><body><div id=root></div></body></html>";

// A synthetic plugin schema owned by this test. live-server / present-relay are
// plugin-agnostic: they sync opaque, plugin-owned typed state addressed by id and
// never reference any concrete plugin's schema (that's what lets a non-liebstoeckel
// dev's plugin sync with zero server changes, (internal ADR)). So the test brings its
// own schema rather than borrowing a real plugin's, same spirit as `@acme/seed`.
const voteSchema = schema({ options: t.array(t.string), votes: t.record(t.string) });

// A deck whose manifest declares the `vote` plugin's audience-writable field, so an
// audience peer may write `votes` (but nothing else) under the default enforcement.
const VOTE_DECK = embedManifest(BASE_HTML, {
  v: 1,
  plugins: [{ name: "@acme/vote", version: "1.0.0", hasServer: false, id: "vote", audienceWrites: ["votes"] }],
} satisfies PluginManifest);
const countByOption = (s: { options: string[]; votes: Record<string, string> }) =>
  s.options.map((option) => ({ option, count: Object.values(s.votes).filter((v) => v === option).length }));

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

    // a public viewer connects to the relay and should observe the seeded state, // produced by the runner's server plugin, never executed on the relay itself
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

  test("typed plugin state converges across two clients through the relay", async () => {
    const base = startRelay();
    // Default upload enforces audience write-scope; VOTE_DECK's manifest declares
    // `votes` as audience-writable, so the viewer's vote is in scope and converges.
    const info = await uploadDeck(base, TOKEN, VOTE_DECK);
    const mk = (role: "presenter" | "viewer", token: string, p: string) =>
      track(connectLive({ ws: `${info.urls.sync}?t=${token}`, session: info.id, role, token }, p));

    const presenter = mk("presenter", info.presenterToken, "pres");
    const viewer = mk("viewer", info.viewerToken, "view");
    await Promise.all([
      new Promise<void>((r) => presenter.onStatus((c) => c && r())),
      new Promise<void>((r) => viewer.onStatus((c) => c && r())),
    ]);

    const ps = pluginState(presenter.doc, "vote", voteSchema);
    ps.ensureDefaults({ options: ["A", "B"] });
    ps.recordSet("votes", "pres", "A");
    await waitUntil(() => pluginState(viewer.doc, "vote", voteSchema).snapshot().options.length === 2);

    pluginState(viewer.doc, "vote", voteSchema).recordSet("votes", "view", "B");
    await waitUntil(() => Object.keys(pluginState(presenter.doc, "vote", voteSchema).snapshot().votes).length === 2);

    for (const conn of [presenter, viewer]) {
      const snap = pluginState(conn.doc, "vote", voteSchema).snapshot();
      expect(snap.votes).toEqual({ pres: "A", view: "B" });
      expect(countByOption(snap)).toEqual([
        { option: "A", count: 1 },
        { option: "B", count: 1 },
      ]);
    }
  });

  test("default enforcement drops a viewer write outside the manifest's audienceWrites", async () => {
    const base = startRelay();
    const info = await uploadDeck(base, TOKEN, VOTE_DECK); // enforce on by default
    const mk = (role: "presenter" | "viewer", token: string, p: string) =>
      track(connectLive({ ws: `${info.urls.sync}?t=${token}`, session: info.id, role, token }, p));
    const presenter = mk("presenter", info.presenterToken, "pres");
    const viewer = mk("viewer", info.viewerToken, "view");
    await Promise.all([
      new Promise<void>((r) => presenter.onStatus((c) => c && r())),
      new Promise<void>((r) => viewer.onStatus((c) => c && r())),
    ]);

    // In scope (votes) → converges to the presenter.
    pluginState(viewer.doc, "vote", voteSchema).recordSet("votes", "view", "B");
    await waitUntil(() => Object.keys(pluginState(presenter.doc, "vote", voteSchema).snapshot().votes).length === 1);

    // Out of scope (options is presenter-only) → the relay drops it; it never lands.
    pluginState(viewer.doc, "vote", voteSchema).set("options", ["X", "Y", "Z"]);
    await Bun.sleep(300);
    expect(pluginState(presenter.doc, "vote", voteSchema).snapshot().options).toEqual([]);
  });

  test("endSession tears the session down", async () => {
    const base = startRelay();
    const info = await uploadDeck(base, TOKEN, BASE_HTML);
    expect((await fetch(`${base}/s/${info.id}?t=${info.viewerToken}`)).status).toBe(200);
    await endSession(base, TOKEN, info.id);
    expect((await fetch(`${base}/s/${info.id}?t=${info.viewerToken}`)).status).toBe(403);
  });
});
