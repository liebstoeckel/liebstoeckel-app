import { test, expect, describe, afterEach, setDefaultTimeout } from "bun:test";
// Relative import on purpose, as in relay-integration.test.ts: present-relay depends on
// live-server, so it cannot be declared as a dependency here.
import { createRelay, type RelayServer } from "../../present-relay/src/index.ts";
import { connectLive, type LiveConnection } from "@liebstoeckel/engine/live";
import type { LiveState } from "@liebstoeckel/engine/live";
import type { Refusal } from "@liebstoeckel/plugin-sdk";
import { pluginState, schema, t } from "@liebstoeckel/plugin-sdk";
import { embedManifest, type PluginManifest } from "./manifest";
import { uploadDeck } from "./relay-client";

// A refused audience write, end to end: the relay refuses it, the viewer's doc is
// replaced by the relay's state (the vote reads as not cast, or as the previous vote),
// the viewer hears why, and the presenter sees a notice until writes are taken again.

const TOKEN = "acct-token";
const voteSchema = schema({ options: t.array(t.string), votes: t.record(t.string) });
const DECK = embedManifest("<html><head><title>deck</title></head><body><div id=root></div></body></html>", {
  v: 1,
  plugins: [{ name: "@acme/vote", version: "1.0.0", hasServer: false, id: "vote", audienceWrites: ["votes"] }],
} satisfies PluginManifest);

let relay: RelayServer | null = null;
const closers: Array<() => void> = [];
afterEach(async () => {
  for (const c of closers.splice(0)) c();
  await relay?.stop();
  relay = null;
});

async function waitUntil(fn: () => boolean, ms = 3000): Promise<void> {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error("waitUntil: timed out");
    await Bun.sleep(20);
  }
}

async function session(opts: Partial<Parameters<typeof createRelay>[0]>) {
  relay = createRelay({ accountTokens: [TOKEN], hostname: "127.0.0.1", port: 0, resetMinGapMs: 0, ...opts });
  const info = await uploadDeck(`http://127.0.0.1:${relay.port}`, TOKEN, DECK);
  const mk = (role: "presenter" | "viewer", token: string, p: string) => {
    const c = connectLive({ ws: `${info.urls.sync}?t=${token}`, session: info.id, role, token }, p, { staleMs: 0 });
    closers.push(() => c.close());
    return c;
  };
  const presenter = mk("presenter", info.presenterToken, "pres");
  const viewer = mk("viewer", info.viewerToken, "view");
  let pState: LiveState = { status: "connecting" };
  presenter.onState((s) => (pState = s));
  let refusals: ReadonlyMap<string, Refusal> = new Map();
  viewer.onRefusals((r) => (refusals = r));
  const docs: unknown[] = [];
  viewer.onDoc((d) => docs.push(d));
  await Promise.all([
    new Promise<void>((r) => presenter.onStatus((c) => c && r())),
    new Promise<void>((r) => viewer.onStatus((c) => c && r())),
  ]);
  pluginState(presenter.doc, "vote", voteSchema).ensureDefaults({ options: ["A", "B"] });
  await waitUntil(() => pluginState(viewer.doc, "vote", voteSchema).snapshot().options.length === 2);
  return {
    presenter,
    viewer,
    presenterState: () => pState,
    refusals: () => refusals,
    docSwaps: () => docs.length,
    votesAt: (c: LiveConnection) => pluginState(c.doc, "vote", voteSchema).snapshot().votes,
    vote: (option: string) => pluginState(viewer.doc, "vote", voteSchema).recordSet("votes", "view", option),
  };
}


// real sockets and timers: give a busy CI host room
setDefaultTimeout(20_000);

describe("refused audience writes reach the viewer and the presenter", () => {
  test("memory stop: vote rolled back, viewer told `busy`, presenter notice until a write is taken", async () => {
    let room = false;
    const s = await session({ admitAudience: () => room });

    s.vote("A");
    await waitUntil(() => s.refusals().get("plugin:vote")?.reason === "busy");
    await waitUntil(() => s.docSwaps() === 1);
    // the viewer's screen matches the presenter's: no vote
    expect(s.votesAt(s.viewer)).toEqual({});
    expect(s.votesAt(s.presenter)).toEqual({});
    await waitUntil(() => s.presenterState().refusing === "busy");

    // room again: the next vote goes through, the viewer's message and the presenter's
    // notice both go away
    room = true;
    s.vote("B");
    expect(s.refusals().has("plugin:vote")).toBe(false); // cleared by the new write
    await waitUntil(() => s.votesAt(s.presenter).view === "B");
    await waitUntil(() => s.presenterState().refusing === undefined);
    expect(s.docSwaps()).toBe(1); // an accepted write replaces nothing
  });

  test("a refused vote change shows the previous vote again, and later votes still arrive", async () => {
    let room = true;
    const s = await session({ admitAudience: () => room });
    s.vote("A");
    await waitUntil(() => s.votesAt(s.presenter).view === "A");

    room = false;
    s.vote("B");
    await waitUntil(() => s.docSwaps() === 1);
    expect(s.votesAt(s.viewer)).toEqual({ view: "A" }); // what the presenter counts
    expect(s.votesAt(s.presenter)).toEqual({ view: "A" });

    // Before the doc was replaced, a vote after a refused one built on the refused
    // item and was silently lost for good. Now it arrives.
    room = true;
    s.vote("B");
    await waitUntil(() => s.votesAt(s.presenter).view === "B");
  });

  test("a full field: viewer told `full`, presenter notice goes away after a quiet spell", async () => {
    const s = await session({ audienceEntryCap: 1, refusingQuietMs: 300 });
    // one vote fills the field (cap 1)
    pluginState(s.presenter.doc, "vote", voteSchema).recordSet("votes", "someone", "A");
    await waitUntil(() => s.votesAt(s.viewer).someone === "A");

    s.vote("B");
    await waitUntil(() => s.refusals().get("plugin:vote")?.reason === "full");
    await waitUntil(() => s.docSwaps() === 1);
    expect(s.votesAt(s.viewer)).toEqual({ someone: "A" });
    await waitUntil(() => s.presenterState().refusing === "full");
    await waitUntil(() => s.presenterState().refusing === undefined, 3000);
    // the viewer's message stays until they write again
    expect(s.refusals().get("plugin:vote")?.reason).toBe("full");
  });
});
