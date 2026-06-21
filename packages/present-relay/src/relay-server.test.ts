import { test, expect, describe, afterEach } from "bun:test";
import * as Y from "yjs";
import { createRelay, type RelayServer } from "./relay-server";

const TOKEN = "acct-secret-token";
const DECK = "<!doctype html><html><head><title>deck</title></head><body><div id=root></div></body></html>";

let relay: RelayServer | null = null;
afterEach(async () => {
  await relay?.stop();
  relay = null;
});

function start(extra: Partial<Parameters<typeof createRelay>[0]> = {}) {
  relay = createRelay({ accountTokens: [TOKEN], hostname: "127.0.0.1", port: 0, ...extra });
  return `http://127.0.0.1:${relay.port}`;
}

const createSession = (base: string, html = DECK, token = TOKEN) =>
  fetch(`${base}/api/sessions`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "text/html" },
    body: html,
  });

const wsOpen = (url: string): Promise<{ ws: WebSocket; first: Promise<Uint8Array> }> =>
  new Promise((res, rej) => {
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    const first = new Promise<Uint8Array>((r) =>
      ws.addEventListener("message", (e) => r(new Uint8Array(e.data as ArrayBuffer)), { once: true }),
    );
    ws.addEventListener("open", () => res({ ws, first }));
    ws.addEventListener("error", rej);
  });

describe("relay control API auth", () => {
  test("rejects upload without/with a bad account token", async () => {
    const base = start();
    expect((await fetch(`${base}/api/sessions`, { method: "POST", body: DECK })).status).toBe(401);
    expect((await createSession(base, DECK, "wrong")).status).toBe(401);
  });

  test("creates a session and returns tokens + public urls", async () => {
    const base = start();
    const res = await createSession(base);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.presenterToken).toBeTruthy();
    expect(body.viewerToken).toBeTruthy();
    expect(body.runnerToken).toBeTruthy();
    // Links carry signed grants ((internal ADR)), not the raw session token.
    expect(body.urls.viewer).toContain(`/s/${body.id}?t=`);
    expect(body.urls.viewer).not.toContain(body.viewerToken);
    expect(body.viewerGrant).toBeTruthy();
    expect(body.urls.sync).toContain(`/sync/${body.id}`);
    expect(body.urls.sync.startsWith("ws://")).toBe(true);
  });

  test("enforces the deck size cap (413)", async () => {
    const base = start({ maxDeckBytes: 1024 });
    const big = "<html>" + "x".repeat(2048) + "</html>";
    expect((await createSession(base, big)).status).toBe(413);
  });

  test("enforces the per-account session quota (429)", async () => {
    const base = start({ maxSessionsPerAccount: 1 });
    expect((await createSession(base)).status).toBe(200);
    expect((await createSession(base)).status).toBe(429);
  });

  // (internal ADR): a caller-supplied stable id lets re-provision re-create a session under the
  // SAME id on a new pod, so the audience URL + its stateless grant survive the move.
  test("pins the session id from x-session-id and re-creates idempotently", async () => {
    const base = start();
    const withId = (id: string) =>
      fetch(`${base}/api/sessions`, {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}`, "content-type": "text/html", "x-session-id": id },
        body: DECK,
      });
    const a = await (await withId("stable-abc")).json();
    expect(a.id).toBe("stable-abc");
    expect(a.urls.viewer).toContain("/s/stable-abc?t=");
    expect(a.urls.sync).toContain("/sync/stable-abc");
    // The viewer grant the relay minted validates against this id, connecting works.
    const ok = await fetch(`${base}/s/stable-abc?t=${a.viewerGrant}`);
    expect(ok.status).toBe(200);
    // Re-creating under the same id (a re-provision) succeeds and stays the same id; the
    // FIRST provision's grant still validates on the "new" session (grants are stateless).
    const b = await (await withId("stable-abc")).json();
    expect(b.id).toBe("stable-abc");
    expect((await fetch(`${base}/s/stable-abc?t=${a.viewerGrant}`)).status).toBe(200);
  });
});

describe("relay deck serving (opaque sandbox)", () => {
  test("serves the deck for a valid token with the sandbox CSP + bootstrap", async () => {
    const base = start();
    const { id, viewerToken } = await (await createSession(base)).json();
    const res = await fetch(`${base}/s/${id}?t=${viewerToken}`);
    expect(res.status).toBe(200);
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("sandbox allow-scripts");
    expect(csp).toContain("allow-popups"); // presenter pop-out (window.open), (internal ADR)
    expect(csp).not.toContain("allow-same-origin");
    expect(csp).not.toContain("allow-fullscreen"); // invalid sandbox token, must not regress
    expect(csp).toContain("connect-src");
    // (internal ADR): default-src lockdown closes the remote-load / GET-exfil gap.
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("img-src data: blob:");
    expect(csp).toContain("frame-ancestors 'none'");
    const html = await res.text();
    expect(html).toContain("window.__LIEBSTOECKEL_LIVE__");
    expect(html).toContain(`/sync/${id}?t=${viewerToken}`);
    expect(html).toContain('"role":"viewer"');
  });

  test("403 for a bad token, a missing session, or the runner token", async () => {
    const base = start();
    const { id, runnerToken } = await (await createSession(base)).json();
    expect((await fetch(`${base}/s/${id}?t=nope`)).status).toBe(403);
    expect((await fetch(`${base}/s/does-not-exist?t=nope`)).status).toBe(403);
    // runner token is WS-only; it must not render the page
    expect((await fetch(`${base}/s/${id}?t=${runnerToken}`)).status).toBe(403);
  });

  test("DELETE ends the session (owner only); links then 403", async () => {
    const base = start();
    const { id, viewerToken } = await (await createSession(base)).json();
    expect((await fetch(`${base}/api/sessions/${id}`, { method: "DELETE" })).status).toBe(401);
    const del = await fetch(`${base}/api/sessions/${id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(del.status).toBe(204);
    expect((await fetch(`${base}/s/${id}?t=${viewerToken}`)).status).toBe(403);
  });

  test("healthz responds", async () => {
    const base = start();
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
  });
});

describe("relay WebSocket sync", () => {
  test("a presenter update propagates to a viewer through the relay", async () => {
    const base = start();
    const { id, presenterToken, viewerToken } = await (await createSession(base)).json();
    const wsBase = `ws://127.0.0.1:${relay!.port}/sync/${id}`;

    const pres = await wsOpen(`${wsBase}?t=${presenterToken}`);
    await pres.first;
    const view = await wsOpen(`${wsBase}?t=${viewerToken}`);
    await view.first;

    const got = new Promise<Uint8Array>((r) =>
      view.ws.addEventListener("message", (e) => r(new Uint8Array(e.data as ArrayBuffer)), { once: true }),
    );
    const local = new Y.Doc();
    local.getMap("deck").set("index", 3);
    pres.ws.send(new Uint8Array(Y.encodeStateAsUpdate(local)));

    const mirror = new Y.Doc();
    Y.applyUpdate(mirror, await got);
    expect(mirror.getMap("deck").get("index")).toBe(3);

    pres.ws.close();
    view.ws.close();
  });

  test("WS rejects an invalid session token", async () => {
    const base = start();
    const { id } = await (await createSession(base)).json();
    const res = await fetch(`${base}/sync/${id}?t=bad`, { headers: { upgrade: "websocket" } });
    expect(res.status).toBe(403);
  });
});

describe("graceful shutdown flushes snapshots ((internal ADR) / (internal ticket))", () => {
  function memStorage() {
    const store = new Map<string, Uint8Array>();
    return {
      store,
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, b: Uint8Array) => {
        store.set(k, b);
      },
    };
  }

  test("stop() awaits the final snapshot write for active persisted sessions", async () => {
    const storage = memStorage();
    const base = start({ storage, snapshotMs: 1_000_000 }); // disable the timer; only stop() flushes
    const res = await fetch(`${base}/api/sessions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "text/html",
        "x-snapshot-key": "org/live/flush.snap",
      },
      body: DECK,
    });
    expect(res.status).toBe(200);
    // Nothing flushed yet (timer disabled).
    expect(storage.store.has("org/live/flush.snap")).toBe(false);

    await relay!.stop();
    relay = null; // already stopped, keep afterEach a no-op

    // The flush must have completed before stop() resolved (no lost results).
    expect(storage.store.has("org/live/flush.snap")).toBe(true);
    const snap = storage.store.get("org/live/flush.snap")!;
    expect(snap.byteLength).toBeGreaterThan(0);
    // It is a valid Yjs update (applying it to a fresh doc does not throw).
    Y.applyUpdate(new Y.Doc(), snap);
  });
});

describe("relay /stats (control-plane placement, (internal ticket))", () => {
  test("returns this pod's live load, account-gated", async () => {
    const base = start();
    expect((await fetch(`${base}/stats`)).status).toBe(401); // no token
    const empty = await fetch(`${base}/stats`, { headers: { authorization: `Bearer ${TOKEN}` } });
    expect(empty.status).toBe(200);
    expect((await empty.json()).sessions).toBe(0);
    await createSession(base);
    const one = await (await fetch(`${base}/stats`, { headers: { authorization: `Bearer ${TOKEN}` } })).json();
    expect(one.ok).toBe(true);
    expect(one.sessions).toBe(1);
  });
});

describe("relay cordon, drain control ((internal ticket))", () => {
  test("POST /cordon flips the flag in /stats and refuses new sessions; uncordon lifts it", async () => {
    const base = start();
    expect((await fetch(`${base}/cordon`, { method: "POST" })).status).toBe(401); // account-gated
    const c = await fetch(`${base}/cordon`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ cordoned: true }),
    });
    expect(c.status).toBe(200);
    const stats = await (await fetch(`${base}/stats`, { headers: { authorization: `Bearer ${TOKEN}` } })).json();
    expect(stats.cordoned).toBe(true);
    expect((await createSession(base)).status).toBe(503); // cordoned → no new sessions
    await fetch(`${base}/cordon`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ cordoned: false }),
    });
    expect((await createSession(base)).status).toBe(200); // uncordoned again
  });
});
