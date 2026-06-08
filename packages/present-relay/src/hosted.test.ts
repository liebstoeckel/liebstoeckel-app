import { test, expect, describe, afterEach } from "bun:test";
import * as Y from "yjs";
import { createRelay, type RelayServer, type RelayStorage } from "./relay-server";
import { mintGrant } from "./grant";

// Hosted live presenting ((internal ADR)): audience write-scope enforcement + snapshot
// persistence. A deck whose embedded manifest lets the audience write only `votes`
// on plugin "poll".
const TOKEN = "acct-secret-token";
const MANIFEST = JSON.stringify({
  v: 1,
  plugins: [{ name: "poll", version: "0", hasServer: false, id: "poll", audienceWrites: ["votes"] }],
});
const DECK =
  `<!doctype html><html><head><title>deck</title></head><body><div id=root></div>` +
  `<script type="application/json" data-liebstoeckel-plugins>${MANIFEST}</script></body></html>`;

let relay: RelayServer | null = null;
afterEach(async () => {
  await relay?.stop();
  relay = null;
});

function memStorage(): RelayStorage & { map: Map<string, Uint8Array> } {
  const map = new Map<string, Uint8Array>();
  return {
    map,
    async get(k) {
      return map.get(k) ?? null;
    },
    async put(k, b) {
      map.set(k, b);
    },
  };
}

function start(extra: Partial<Parameters<typeof createRelay>[0]> = {}) {
  relay = createRelay({ accountTokens: [TOKEN], hostname: "127.0.0.1", port: 0, ...extra });
  return `http://127.0.0.1:${relay.port}`;
}

const create = (base: string, headers: Record<string, string> = {}) =>
  fetch(`${base}/api/sessions`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "text/html", ...headers },
    body: DECK,
  }).then((r) => r.json());

function wsOpen(url: string): Promise<{ ws: WebSocket; first: Promise<Uint8Array> }> {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    const first = new Promise<Uint8Array>((r) =>
      ws.addEventListener("message", (e) => r(new Uint8Array(e.data as ArrayBuffer)), { once: true }),
    );
    ws.addEventListener("open", () => res({ ws, first }));
    ws.addEventListener("error", rej);
  });
}

/** Encode an update that sets `root[key][...]` so we can craft scoped/out-of-scope writes. */
function setUpdate(build: (d: Y.Doc) => void): Uint8Array<ArrayBuffer> {
  const d = new Y.Doc();
  build(d);
  return new Uint8Array(Y.encodeStateAsUpdate(d)); // copy into a plain ArrayBuffer for ws.send
}

const settle = () => new Promise((r) => setTimeout(r, 150));

describe("hosted relay: audience write-scope enforcement", () => {
  test("an audience (viewer) vote propagates, but an out-of-scope write is dropped", async () => {
    const base = start();
    const { id, presenterToken, viewerToken } = await create(base, { "x-live-enforce": "1" });
    const wsBase = `ws://127.0.0.1:${relay!.port}/sync/${id}`;

    const pres = await wsOpen(`${wsBase}?t=${presenterToken}`);
    await pres.first;
    const view = await wsOpen(`${wsBase}?t=${viewerToken}`);
    await view.first;

    // In-scope: a vote (plugin:poll.votes) — must reach the presenter.
    view.ws.send(
      setUpdate((d) => {
        const votes = new Y.Map<string>();
        votes.set("pidA", "red");
        d.getMap("plugin:poll").set("votes", votes);
      }),
    );
    // Out-of-scope: hijack navigation — must be dropped.
    view.ws.send(setUpdate((d) => d.getMap("nav").set("slide", 99)));
    await settle();

    // Read the relay's authoritative doc via a fresh presenter connection (full replay).
    const probe = await wsOpen(`${wsBase}?t=${presenterToken}`);
    const doc = new Y.Doc();
    Y.applyUpdate(doc, await probe.first);
    expect((doc.getMap("plugin:poll").get("votes") as Y.Map<string>)?.get("pidA")).toBe("red"); // vote applied
    expect(doc.getMap("nav").get("slide")).toBeUndefined(); // nav hijack dropped

    pres.ws.close();
    view.ws.close();
    probe.ws.close();
  });

  test("without enforcement (CLI/trusted), a viewer may write anything", async () => {
    const base = start();
    const { id, presenterToken, viewerToken } = await create(base); // no x-live-enforce
    const wsBase = `ws://127.0.0.1:${relay!.port}/sync/${id}`;
    const pres = await wsOpen(`${wsBase}?t=${presenterToken}`);
    await pres.first;
    const view = await wsOpen(`${wsBase}?t=${viewerToken}`);
    await view.first;
    view.ws.send(setUpdate((d) => d.getMap("nav").set("slide", 7)));
    await settle();
    const probe = await wsOpen(`${wsBase}?t=${presenterToken}`);
    const doc = new Y.Doc();
    Y.applyUpdate(doc, await probe.first);
    expect(doc.getMap("nav").get("slide")).toBe(7); // trusted model: applied
    pres.ws.close();
    view.ws.close();
    probe.ws.close();
  });
});

describe("hosted relay: signed-grant connection auth ((internal ADR))", () => {
  test("the returned links carry grants that authenticate; raw tokens still work", async () => {
    const base = start();
    const s = await create(base);
    // the viewer link carries a grant, not the raw token
    const grant = new URL(s.urls.viewer).searchParams.get("t")!;
    expect(grant).not.toBe(s.viewerToken);
    expect((await fetch(`${base}/s/${s.id}?t=${grant}`)).status).toBe(200); // grant works
    expect((await fetch(`${base}/s/${s.id}?t=${s.viewerToken}`)).status).toBe(200); // token fallback works
    const html = await (await fetch(`${base}/s/${s.id}?t=${grant}`)).text();
    expect(html).toContain('"role":"viewer"');
  });

  test("a forged grant (wrong secret) or wrong-session grant is rejected", async () => {
    const base = start();
    const s = await create(base);
    const forged = mintGrant({ session: s.id, role: "presenter", exp: Date.now() + 60_000 }, "not-the-account-token");
    expect((await fetch(`${base}/s/${s.id}?t=${forged}`)).status).toBe(403);
    const wrongSession = mintGrant({ session: "other", role: "viewer", exp: Date.now() + 60_000 }, TOKEN);
    expect((await fetch(`${base}/s/${s.id}?t=${wrongSession}`)).status).toBe(403);
  });

  test("an expired grant is rejected", async () => {
    const base = start();
    const s = await create(base);
    const expired = mintGrant({ session: s.id, role: "viewer", exp: Date.now() - 1 }, TOKEN);
    expect((await fetch(`${base}/s/${s.id}?t=${expired}`)).status).toBe(403);
  });
});

describe("hosted relay: plan limits ((internal ADR))", () => {
  test("a per-session TTL shortens expiry below the relay default", async () => {
    const base = start({ sessionTtlMs: 6 * 60 * 60 * 1000 });
    const r = await fetch(`${base}/api/sessions`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "text/html", "x-session-ttl-ms": "60000" },
      body: DECK,
    });
    const body = await r.json();
    const lifetime = body.expiresAt - Date.now();
    expect(lifetime).toBeLessThanOrEqual(60_000 + 2000); // ~60s, not 6h
    expect(lifetime).toBeGreaterThan(30_000);
  });

  test("a requested TTL can't exceed the relay max (clamped)", async () => {
    const base = start({ sessionTtlMs: 60_000 });
    const r = await fetch(`${base}/api/sessions`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "text/html", "x-session-ttl-ms": "999999999" },
      body: DECK,
    });
    const body = await r.json();
    expect(body.expiresAt - Date.now()).toBeLessThanOrEqual(60_000 + 2000); // clamped to max
  });

  test("the audience cap rejects the (cap+1)th audience peer; presenter is never capped", async () => {
    const base = start();
    const { id, presenterToken, viewerToken } = await create(base, { "x-audience-cap": "1" });
    const wsBase = `ws://127.0.0.1:${relay!.port}/sync/${id}`;
    // presenter (uncapped) + one audience fill the cap
    const pres = await wsOpen(`${wsBase}?t=${presenterToken}`);
    await pres.first;
    const a1 = await wsOpen(`${wsBase}?t=${viewerToken}`);
    await a1.first;
    await settle();
    // a 2nd audience peer is refused at upgrade (503)
    const res = await fetch(`${base}/sync/${id}?t=${viewerToken}`, { headers: { upgrade: "websocket" } });
    expect(res.status).toBe(503);
    pres.ws.close();
    a1.ws.close();
  });
});

describe("hosted relay: audience white-label ((internal ADR))", () => {
  test("the audience view carries the provenance badge when watermarked; presenter never does", async () => {
    const base = start();
    const { id, presenterToken, viewerToken } = await create(base, { "x-watermark": "1" });
    const aud = await fetch(`${base}/s/${id}?t=${viewerToken}`).then((r) => r.text());
    const pres = await fetch(`${base}/s/${id}?t=${presenterToken}`).then((r) => r.text());
    expect(aud).toContain("Published with liebstoeckel");
    expect(pres).not.toContain("Published with liebstoeckel");
  });

  test("a white-label session omits the badge on the audience view", async () => {
    const base = start();
    const { id, viewerToken } = await create(base); // no x-watermark
    const aud = await fetch(`${base}/s/${id}?t=${viewerToken}`).then((r) => r.text());
    expect(aud).not.toContain("Published with liebstoeckel");
  });
});

describe("hosted relay: snapshot persistence", () => {
  test("a session snapshots its doc to storage on end, decodable later", async () => {
    const storage = memStorage();
    const base = start({ storage });
    const { id, presenterToken } = await create(base, { "x-snapshot-key": "org1/sess1.snap" });
    const pres = await wsOpen(`ws://127.0.0.1:${relay!.port}/sync/${id}?t=${presenterToken}`);
    await pres.first;
    pres.ws.send(setUpdate((d) => d.getMap("plugin:poll").set("question", "Q?")));
    await settle();
    pres.ws.close();

    // End the session → snapshot persists.
    await fetch(`${base}/api/sessions/${id}`, { method: "DELETE", headers: { authorization: `Bearer ${TOKEN}` } });
    await settle();

    const bytes = storage.map.get("org1/sess1.snap");
    expect(bytes).toBeTruthy();
    const doc = new Y.Doc();
    Y.applyUpdate(doc, bytes!);
    expect(doc.getMap("plugin:poll").get("question")).toBe("Q?");
  });

  test("a failing snapshot write is counted, not swallowed silently", async () => {
    const storage: RelayStorage = {
      async get() {
        return null;
      },
      async put() {
        throw new Error("s3 down");
      },
    };
    const base = start({ storage });
    const { id } = await create(base, { "x-snapshot-key": "org1/boom.snap" });
    await fetch(`${base}/api/sessions/${id}`, { method: "DELETE", headers: { authorization: `Bearer ${TOKEN}` } });
    await settle();
    expect(relay!.stats().snapshotFailures).toBeGreaterThanOrEqual(1);
  });

  test("re-creating with the same snapshot key re-seeds the doc", async () => {
    const storage = memStorage();
    // Pre-seed a snapshot as if a prior session had persisted it.
    const seed = new Y.Doc();
    seed.getMap("plugin:poll").set("question", "seeded");
    storage.map.set("org1/resume.snap", new Uint8Array(Y.encodeStateAsUpdate(seed)));

    const base = start({ storage });
    const { id, viewerToken } = await create(base, { "x-snapshot-key": "org1/resume.snap" });
    const view = await wsOpen(`ws://127.0.0.1:${relay!.port}/sync/${id}?t=${viewerToken}`);
    const doc = new Y.Doc();
    Y.applyUpdate(doc, await view.first); // full-state replay on join
    expect(doc.getMap("plugin:poll").get("question")).toBe("seeded");
    view.ws.close();
  });
});
