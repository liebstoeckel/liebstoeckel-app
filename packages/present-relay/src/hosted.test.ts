import { test, expect, describe, afterEach } from "bun:test";
import * as Y from "yjs";
import { createRelay, MAX_SESSION_TTL_MS, type RelayServer, type RelayStorage } from "./relay-server";
import { mintGrant } from "./grant";
import { CLOSE } from "@liebstoeckel/live-server/placement/protocol";

// Hosted live presenting ((internal ADR)): audience write-scope enforcement + snapshot
// persistence. A deck whose embedded manifest lets the audience write only `votes`
// on plugin "poll".
const TOKEN = "acct-secret-token";
const MANIFEST = JSON.stringify({
  v: 1,
  plugins: [{ name: "poll", version: "0", hasServer: false, id: "poll", audienceWrites: ["votes"] }],
});
const DECK =
  `<!doctype html><html><head><meta name="generator" content="liebstoeckel engine 0.4.0, cli 0.4.0" /><title>deck</title></head><body><div id=root></div>` +
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

const create = (base: string, headers: Record<string, string> = {}, body = DECK) =>
  fetch(`${base}/api/sessions`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "text/html", ...headers },
    body,
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

/** Open a presenter link as a browser does: the relay answers the `?t=` link with a 303
 *  and a cookie, the browser follows to the same page with the cookie. */
async function presenterPage(base: string, id: string, token: string, hash = ""): Promise<Response> {
  const first = await fetch(`${base}/s/${id}?t=${token}${hash}`, { redirect: "manual" });
  expect(first.status).toBe(303);
  const cookie = first.headers.get("set-cookie")!.split(";")[0]!;
  return fetch(new URL(first.headers.get("location")!, base), { headers: { cookie } });
}

describe("hosted relay: audience write-scope enforcement", () => {
  test("an audience (viewer) vote propagates, but an out-of-scope write is dropped", async () => {
    const base = start();
    const { id, presenterToken, viewerToken } = await create(base, { "x-live-enforce": "1" });
    const wsBase = `ws://127.0.0.1:${relay!.port}/sync/${id}`;

    const pres = await wsOpen(`${wsBase}?t=${presenterToken}`);
    await pres.first;
    const view = await wsOpen(`${wsBase}?t=${viewerToken}`);
    await view.first;

    // In-scope: a vote (plugin:poll.votes), must reach the presenter.
    view.ws.send(
      setUpdate((d) => {
        const votes = new Y.Map<string>();
        votes.set("pidA", "red");
        d.getMap("plugin:poll").set("votes", votes);
      }),
    );
    // Out-of-scope: hijack navigation, must be dropped.
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

describe("hosted relay: the presenter grant leaves the URL", () => {
  test("a presenter link answers 303 to the same page without t, with the grant in a scoped cookie", async () => {
    const base = start();
    const s = await create(base);
    const grant = new URL(s.urls.presenter).searchParams.get("t")!;
    const res = await fetch(`${base}/s/${s.id}?t=${grant}&x=1`, { redirect: "manual" });
    expect(res.status).toBe(303);
    // Relative, built from the path alone (never from Host headers), other params kept.
    expect(res.headers.get("location")).toBe(`/s/${s.id}?x=1`);
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toStartWith(`lst_presenter_${s.id}=${grant};`);
    expect(cookie).toContain(`Path=/s/${s.id}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Max-Age"); // gone with the browser session
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  test("a deck built before the cookie exchange keeps t in the address, so its phone link works", async () => {
    const base = start();
    // A 0.3 engine builds the phone link from the address bar; a 303 would strip the grant.
    const old = DECK.replace("liebstoeckel engine 0.4.0", "liebstoeckel engine 0.3.10");
    const s = await create(base, {}, old);
    const grant = new URL(s.urls.presenter).searchParams.get("t")!;
    const res = await fetch(`${base}/s/${s.id}?t=${grant}`, { redirect: "manual" });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie") ?? "").not.toContain("lst_presenter_");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await res.text()).toContain('"role":"presenter"');
    // Unstamped HTML (built before the stamp existed) is treated the same way.
    const bare = await create(base, {}, DECK.replace(/<meta name="generator"[^>]*>/, ""));
    const bareGrant = new URL(bare.urls.presenter).searchParams.get("t")!;
    expect((await fetch(`${base}/s/${bare.id}?t=${bareGrant}`, { redirect: "manual" })).status).toBe(200);
  });

  test("the cookie alone brings back the presenter, for a reload and the pop-out", async () => {
    const base = start();
    const s = await create(base);
    const grant = new URL(s.urls.presenter).searchParams.get("t")!;
    const page = await presenterPage(base, s.id, grant, "#presenter");
    expect(page.status).toBe(200);
    expect(page.headers.get("cache-control")).toContain("no-store");
    expect(page.headers.get("vary")).toContain("Cookie");
    const html = await page.text();
    expect(html).toContain('"role":"presenter"');
    // The socket still gets the grant, from the page's memory, not from the address bar.
    expect(html).toContain(`?t=${grant}`);
    // A raw presenter token (the CLI's relay mode) goes through the same exchange.
    expect((await presenterPage(base, s.id, s.presenterToken)).status).toBe(200);
  });

  test("viewer links keep their t and set no presenter cookie; an explicit t beats the cookie", async () => {
    const base = start();
    const s = await create(base);
    const viewer = await fetch(s.urls.viewer.replace(/^https?:\/\/[^/]+/, base), { redirect: "manual" });
    expect(viewer.status).toBe(200);
    expect(viewer.headers.get("set-cookie")).not.toContain("lst_presenter_");
    const grant = new URL(s.urls.presenter).searchParams.get("t")!;
    const cookie = `lst_presenter_${s.id}=${grant}`;
    const asViewer = await fetch(`${base}/s/${s.id}?t=${s.viewerToken}`, { headers: { cookie }, redirect: "manual" });
    expect(await asViewer.text()).toContain('"role":"viewer"');
  });

  test("a cookie that is not a valid presenter grant for this session is refused", async () => {
    const base = start();
    const s = await create(base);
    const other = await create(base);
    const viewerGrant = new URL(s.urls.viewer).searchParams.get("t")!;
    const otherGrant = new URL(other.urls.presenter).searchParams.get("t")!;
    const bad = [
      `lst_presenter_${s.id}=${viewerGrant}`, // a viewer grant does not become a presenter
      `lst_presenter_${s.id}=${s.runnerToken}`, // runner tokens never load the page
      `lst_presenter_${s.id}=${otherGrant}`, // another session's grant
      `lst_presenter_${other.id}=${otherGrant}`, // another session's cookie name
      `lst_presenter_${s.id}=${mintGrant({ session: s.id, role: "presenter", exp: Date.now() - 1 }, TOKEN)}`,
    ];
    for (const cookie of bad) {
      const res = await fetch(`${base}/s/${s.id}`, { headers: { cookie } });
      expect(res.status).toBe(403);
      expect(await res.text()).toContain("presenter link");
    }
    expect((await fetch(`${base}/s/${s.id}`)).status).toBe(403);
  });
});

describe("hosted relay: a viewer's participant id stays with its browser", () => {
  const participantOf = async (res: Response) => /"participant":"([^"]*)"/.exec(await res.text())?.[1];
  const viewerCookieOf = (res: Response, id: string) =>
    res.headers
      .get("set-cookie")
      ?.split(/,(?=\s*lst_)/)
      .find((c) => c.trim().startsWith(`lst_viewer_${id}=`));
  const local = (u: string, base: string) => u.replace(/^https?:\/\/[^/]+/, base);

  test("a viewer page issues a participant id in a session-scoped cookie and the bootstrap", async () => {
    const base = start();
    const s = await create(base);
    const res = await fetch(local(s.urls.viewer, base));
    expect(res.status).toBe(200);
    const cookie = viewerCookieOf(res, s.id)!;
    const id = /^lst_viewer_[^=]+=([^;]+);/.exec(cookie)![1]!;
    expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(cookie).toContain(`Path=/s/${s.id}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    // Ends with the grant: the signed viewer grant carries the session's end.
    const maxAge = Number(/Max-Age=(\d+)/.exec(cookie)![1]);
    const exp = s.expiresAt as number;
    expect(Math.abs(maxAge - (exp - Date.now()) / 1000)).toBeLessThan(5);
    expect(await participantOf(res)).toBe(id);
  });

  test("the same browser coming back (reload, re-scan) keeps its id; another browser gets its own", async () => {
    const base = start();
    const s = await create(base);
    const first = await fetch(local(s.urls.viewer, base));
    const id = await participantOf(first);
    const cookie = viewerCookieOf(first, s.id)!.split(";")[0]!;
    // Re-opening the join link in the same browser: the cookie comes along.
    const again = await fetch(local(s.urls.viewer, base), { headers: { cookie } });
    expect(await participantOf(again)).toBe(id);
    expect(viewerCookieOf(again, s.id)).toStartWith(`${cookie};`); // refreshed, same id
    // The address copied into a chat and opened on another device: no cookie, new id.
    const copied = await fetch(`${local(s.urls.viewer, base)}&pid=${id}`);
    const other = await participantOf(copied);
    expect(other).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(other).not.toBe(id);
  });

  test("a malformed or foreign viewer cookie is not used", async () => {
    const base = start();
    const s = await create(base);
    const other = await create(base);
    for (const cookie of [
      `lst_viewer_${s.id}=short`,
      `lst_viewer_${s.id}=${"x".repeat(65)}`,
      `lst_viewer_${s.id}=a"b<script>x`,
      `lst_viewer_${other.id}=another-session-0001`,
    ]) {
      const id = await participantOf(await fetch(local(s.urls.viewer, base), { headers: { cookie } }));
      expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
      expect(id).not.toBe("another-session-0001");
    }
  });

  test("the viewer cookie never stands for a role, and a presenter page gets none", async () => {
    const base = start();
    const s = await create(base);
    const first = await fetch(local(s.urls.viewer, base));
    const cookie = viewerCookieOf(first, s.id)!.split(";")[0]!;
    const bare = await fetch(`${base}/s/${s.id}`, { headers: { cookie } });
    expect(bare.status).toBe(403);
    const grant = new URL(s.urls.presenter).searchParams.get("t")!;
    const presenter = await presenterPage(base, s.id, grant);
    expect(presenter.headers.get("set-cookie")).toBeNull();
    expect(await participantOf(presenter)).toBe("");
  });

  test("the cookie's lifetime follows the viewer grant it came with", async () => {
    const base = start();
    const s = await create(base);
    const short = mintGrant({ session: s.id, role: "viewer", exp: Date.now() + 120_000 }, TOKEN);
    const res = await fetch(`${base}/s/${s.id}?t=${short}`);
    const maxAge = Number(/Max-Age=(\d+)/.exec(viewerCookieOf(res, s.id)!)![1]);
    expect(maxAge).toBeGreaterThan(110);
    expect(maxAge).toBeLessThanOrEqual(120);
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

  const HOUR = 60 * 60 * 1000;
  const lifetimeOf = async (base: string, ttl?: number) => {
    const s = await create(base, ttl === undefined ? {} : { "x-session-ttl-ms": String(ttl) });
    return { id: s.id as string, ms: (s.expiresAt as number) - Date.now() };
  };

  test("a plan's duration is kept: 8 h for Pro, 24 h for Team", async () => {
    const base = start();
    for (const hours of [8, 24]) {
      const { ms } = await lifetimeOf(base, hours * HOUR);
      expect(ms).toBeLessThanOrEqual(hours * HOUR);
      expect(ms).toBeGreaterThan(hours * HOUR - 5_000);
    }
  });

  test("a requested duration above the bound is cut to 24 h", async () => {
    const base = start();
    const { ms } = await lifetimeOf(base, 48 * HOUR);
    expect(MAX_SESSION_TTL_MS).toBe(24 * HOUR);
    expect(ms).toBeLessThanOrEqual(MAX_SESSION_TTL_MS);
    expect(ms).toBeGreaterThan(MAX_SESSION_TTL_MS - 5_000);
  });

  test("a configured bound holds too", async () => {
    const base = start({ maxSessionTtlMs: 60_000 });
    const { ms } = await lifetimeOf(base, 999_999_999);
    expect(ms).toBeLessThanOrEqual(60_000);
  });

  test("a relay set to one lifetime keeps it as the ceiling", async () => {
    const base = start({ sessionTtlMs: 60_000 });
    const { ms } = await lifetimeOf(base, 8 * HOUR);
    expect(ms).toBeLessThanOrEqual(60_000);
  });

  test("a session that asks for no duration gets the relay default (6 h)", async () => {
    const base = start();
    const { ms } = await lifetimeOf(base);
    expect(ms).toBeLessThanOrEqual(6 * HOUR);
    expect(ms).toBeGreaterThan(6 * HOUR - 5_000);
  });

  test("the session info reports when the session ends", async () => {
    const base = start();
    const s = await create(base, { "x-session-ttl-ms": String(24 * HOUR) });
    const info = await fetch(`${base}/api/sessions/${s.id}`, { headers: { authorization: `Bearer ${TOKEN}` } }).then((r) => r.json());
    expect(info.expiresAt).toBe(s.expiresAt);
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
    // a 2nd audience peer is let in and closed with `full` before it gets any state (a
    // browser cannot read why an upgrade was refused); the presenter still is not capped
    const a2 = new WebSocket(`${wsBase}?t=${viewerToken}`);
    a2.binaryType = "arraybuffer";
    let frames = 0;
    a2.addEventListener("message", () => frames++);
    const closed = await new Promise<CloseEvent>((r) => a2.addEventListener("close", r, { once: true }));
    expect(closed.code).toBe(CLOSE.FULL);
    expect(closed.reason).toBe("full");
    expect(frames).toBe(0);
    const pres2 = await wsOpen(`${wsBase}?t=${presenterToken}`);
    await pres2.first;
    // once someone leaves there is room again
    a1.ws.close();
    await settle();
    const a3 = await wsOpen(`${wsBase}?t=${viewerToken}`);
    await a3.first;
    pres.ws.close();
    pres2.ws.close();
    a3.ws.close();
  });

  test("a burst of joins cannot slip past the cap together", async () => {
    const base = start();
    const { id, viewerToken } = await create(base, { "x-audience-cap": "3" });
    const wsBase = `ws://127.0.0.1:${relay!.port}/sync/${id}`;
    const socks = Array.from({ length: 8 }, () => {
      const ws = new WebSocket(`${wsBase}?t=${viewerToken}`);
      ws.binaryType = "arraybuffer";
      const got = new Promise<"in" | "full">((r) => {
        ws.addEventListener("message", () => r("in"), { once: true });
        ws.addEventListener("close", (e) => r(e.code === CLOSE.FULL ? "full" : "in"), { once: true });
      });
      return { ws, got };
    });
    const outcomes = await Promise.all(socks.map((s) => s.got));
    expect(outcomes.filter((o) => o === "in").length).toBe(3);
    expect(outcomes.filter((o) => o === "full").length).toBe(5);
    for (const s of socks) s.ws.close();
  });
});

describe("hosted relay: audience white-label ((internal ADR))", () => {
  test("the audience view carries the provenance badge when watermarked; presenter never does", async () => {
    const base = start();
    const { id, presenterToken, viewerToken } = await create(base, { "x-watermark": "1" });
    const aud = await fetch(`${base}/s/${id}?t=${viewerToken}`).then((r) => r.text());
    const pres = await presenterPage(base, id, presenterToken);
    expect(pres.status).toBe(200);
    expect(aud).toContain("Published with liebstoeckel");
    expect(await pres.text()).not.toContain("Published with liebstoeckel");
  });

  test("a white-label session omits the badge on the audience view", async () => {
    const base = start();
    const { id, viewerToken } = await create(base); // no x-watermark
    const aud = await fetch(`${base}/s/${id}?t=${viewerToken}`).then((r) => r.text());
    expect(aud).not.toContain("Published with liebstoeckel");
  });

  const LEGAL = {
    imprint: "https://site.example/impressum",
    privacy: "https://site.example/datenschutz",
    report: "https://app.example/forms/abuse",
  };
  const legalRow = (html: string) => /<nav id="lst-legal"[^>]*>[\s\S]*?<\/nav>/.exec(html)?.[0] ?? null;

  test("with legal links set, the audience page carries the row, white-label or not", async () => {
    const base = start({ legalLinks: LEGAL });
    for (const headers of [{ "x-watermark": "1" }, {}] as Record<string, string>[]) {
      const { id, viewerToken } = await create(base, { ...headers, "x-join-url": "https://app.example/live/abc<x>" });
      const aud = await fetch(`${base}/s/${id}?t=${viewerToken}`).then((r) => r.text());
      const row = legalRow(aud)!;
      expect(row).toContain('href="https://site.example/impressum"');
      expect(row).toContain('href="https://site.example/datenschutz"');
      // The report link names the session by its stable join link, escaped.
      expect(row).toContain(`href="https://app.example/forms/abuse?url=${encodeURIComponent("https://app.example/live/abc%3Cx%3E")}"`);
      expect(row).not.toContain("<x>");
      expect(row.includes("Published with liebstoeckel")).toBe(headers["x-watermark"] === "1");
      expect(aud.match(/id="lst-legal"/g)).toHaveLength(1);
    }
  });

  test("the presenter page carries the row hidden outside the presenter view, and never a presenter grant in it", async () => {
    const base = start({ legalLinks: LEGAL });
    const { id, presenterToken, viewerGrant } = await create(base, { "x-watermark": "1" });
    const pres = await (await presenterPage(base, id, presenterToken)).text();
    const row = legalRow(pres)!;
    expect(row).toMatch(/<nav id="lst-legal" lang="en" aria-label="Legal" hidden>/);
    expect(pres).toContain('location.hash!=="#presenter"');
    expect(row).not.toContain("Published with liebstoeckel");
    // Without a join link, the report link carries the audience link with its viewer grant.
    expect(row).toContain(encodeURIComponent(`/s/${id}?t=${viewerGrant}`));
    expect(row).not.toContain(presenterToken);
  });

  test("without legal links, no row: the plain badge on free sessions as before", async () => {
    const base = start();
    const { id, viewerToken } = await create(base, { "x-watermark": "1" });
    const aud = await fetch(`${base}/s/${id}?t=${viewerToken}`).then((r) => r.text());
    expect(legalRow(aud)).toBeNull();
    expect(aud).toContain("Published with liebstoeckel");
  });

  test("a tab the page opens may leave the sandbox, so a form there can be sent", async () => {
    const base = start({ legalLinks: LEGAL });
    const { id, viewerToken } = await create(base);
    const res = await fetch(`${base}/s/${id}?t=${viewerToken}`);
    expect(res.headers.get("content-security-policy")).toContain("sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox");
  });

  test("a session whose plan keeps audience input tells the page how long; others say nothing", async () => {
    const base = start();
    const kept = await create(base, { "x-audience-input-kept-days": "365" });
    const aud = await fetch(`${base}/s/${kept.id}?t=${kept.viewerToken}`).then((r) => r.text());
    expect(aud).toContain('"audienceInputKeptDays":365');
    const others: Record<string, string>[] = [{}, { "x-audience-input-kept-days": "0" }, { "x-audience-input-kept-days": "soon" }];
    for (const hdr of others) {
      const s = await create(base, hdr);
      const page = await fetch(`${base}/s/${s.id}?t=${s.viewerToken}`).then((r) => r.text());
      expect(page).not.toContain("audienceInputKeptDays");
    }
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
