import { test, expect, describe, afterEach, setDefaultTimeout } from "bun:test";
import { createRelay, joinLink, type RelayServer } from "./relay-server";

// The join card's data: the stable join link the deck shows as its QR, the audience
// count presenters hear, and the count and peak the control plane reads.

const TOKEN = "acct-secret-token";
const OTHER = "other-account-token";
const DECK = "<!doctype html><html><head><title>deck</title></head><body><div id=root></div></body></html>";

let relay: RelayServer | null = null;
afterEach(async () => {
  await relay?.stop();
  relay = null;
});

setDefaultTimeout(20_000);

function start(extra: Partial<Parameters<typeof createRelay>[0]> = {}) {
  relay = createRelay({ accountTokens: [TOKEN, OTHER], hostname: "127.0.0.1", port: 0, ...extra });
  return `http://127.0.0.1:${relay.port}`;
}

async function create(base: string, headers: Record<string, string> = {}, token = TOKEN) {
  const res = await fetch(`${base}/api/sessions`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "text/html", ...headers },
    body: DECK,
  });
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, string>;
}

/** A socket that records the JSON notices it hears. */
async function listen(url: string) {
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";
  const notices: Array<Record<string, unknown>> = [];
  ws.addEventListener("message", (e) => {
    if (typeof e.data === "string") notices.push(JSON.parse(e.data));
  });
  await new Promise<void>((res, rej) => {
    ws.addEventListener("open", () => res());
    ws.addEventListener("error", rej);
  });
  const counts = () => notices.filter((m) => m.t === "audience");
  return { ws, notices, counts };
}

const until = async (check: () => boolean, ms = 5_000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await Bun.sleep(20);
  }
};

/** The bootstrap the relay put into a served page. */
const bootOf = (html: string) =>
  JSON.parse(html.match(/window\.__LIEBSTOECKEL_LIVE__=(\{.*?\})<\/script>/)![1]!) as Record<string, unknown>;

describe("the audience count presenters hear", () => {
  test("a presenter hears the count and cap when it connects and as viewers come and go; viewers hear none", async () => {
    const base = start();
    const s = await create(base, { "x-audience-cap": "30" });
    const sync = `${base.replace("http", "ws")}/sync/${s.id}`;
    const presenter = await listen(`${sync}?t=${s.presenterGrant}&v=3`);
    await until(() => presenter.counts().length === 1);
    expect(presenter.counts()[0]).toEqual({ t: "audience", n: 0, cap: 30 });

    const a = await listen(`${sync}?t=${s.viewerGrant}&v=3`);
    const b = await listen(`${sync}?t=${s.viewerGrant}&v=3`);
    await until(() => presenter.counts().at(-1)?.n === 2);
    b.ws.close();
    await until(() => presenter.counts().at(-1)?.n === 1);
    expect(a.counts()).toEqual([]);
    expect(b.counts()).toEqual([]);
  });

  test("a join storm reaches the presenter as a few messages that end on the right number", async () => {
    const base = start();
    const s = await create(base);
    const sync = `${base.replace("http", "ws")}/sync/${s.id}`;
    const presenter = await listen(`${sync}?t=${s.presenterGrant}&v=3`);
    await until(() => presenter.counts().length === 1);
    const viewers = await Promise.all(Array.from({ length: 20 }, () => listen(`${sync}?t=${s.viewerGrant}&v=3`)));
    await until(() => presenter.counts().at(-1)?.n === 20);
    await Bun.sleep(1_200);
    // once at connect, then at most about once a second
    expect(presenter.counts().length).toBeLessThanOrEqual(4);
    expect(presenter.counts().at(-1)).toEqual({ t: "audience", n: 20 });
    for (const v of viewers) v.ws.close();
  });

  test("a presenter on protocol 1 hears nothing new", async () => {
    const base = start();
    const s = await create(base);
    const sync = `${base.replace("http", "ws")}/sync/${s.id}`;
    const old = await listen(`${sync}?t=${s.presenterGrant}`);
    await listen(`${sync}?t=${s.viewerGrant}&v=3`);
    await Bun.sleep(300);
    expect(old.notices).toEqual([]);
  });
});

describe("the count and peak the control plane reads", () => {
  test("GET /api/sessions/:id: count, peak, cap and end, for the owning account only", async () => {
    const base = start();
    const s = await create(base, { "x-audience-cap": "5" });
    const sync = `${base.replace("http", "ws")}/sync/${s.id}`;
    const read = (token = TOKEN) => fetch(`${base}/api/sessions/${s.id}`, { headers: { authorization: `Bearer ${token}` } });
    expect(await (await read()).json()).toEqual({ audience: 0, peak: 0, cap: 5, expiresAt: s.expiresAt });
    const a = await listen(`${sync}?t=${s.viewerGrant}&v=3`);
    await listen(`${sync}?t=${s.viewerGrant}&v=3`);
    await until(() => relay!.sessions.get(s.id!)!.count.n === 2);
    a.ws.close();
    await until(() => relay!.sessions.get(s.id!)!.count.n === 1);
    expect(await (await read()).json()).toEqual({ audience: 1, peak: 2, cap: 5, expiresAt: s.expiresAt });
    expect((await read(OTHER)).status).toBe(404);
    expect((await fetch(`${base}/api/sessions/${s.id}`)).status).toBe(401);
    expect((await fetch(`${base}/api/sessions/nope`, { headers: { authorization: `Bearer ${TOKEN}` } })).status).toBe(404);
  });

  test("/stats lists the caller's sessions that had an audience, with count and peak", async () => {
    const base = start();
    const mine = await create(base);
    const quiet = await create(base);
    const theirs = await create(base, {}, OTHER);
    for (const s of [mine, theirs]) await listen(`${base.replace("http", "ws")}/sync/${s.id}?t=${s.viewerGrant}&v=3`);
    await until(() => relay!.sessions.get(theirs.id!)!.count.n === 1 && relay!.sessions.get(mine.id!)!.count.n === 1);
    const stats = await (await fetch(`${base}/stats`, { headers: { authorization: `Bearer ${TOKEN}` } })).json();
    expect(stats.sessions).toBe(3);
    expect(stats.audience).toEqual([{ id: mine.id, n: 1, peak: 1 }]);
    expect(stats.audience.some((a: { id: string }) => a.id === quiet.id)).toBe(false);
  });
});

describe("the link the deck shows as its QR", () => {
  test("the control plane's join link, when it names one", async () => {
    const base = start();
    const join = "https://app.example.com/live/k7m2x9qp4r";
    const s = await create(base, { "x-join-url": join });
    for (const t of [s.viewerGrant, s.presenterGrant]) {
      const res = await fetch(`${base}/s/${s.id}?t=${t}`, { redirect: "manual" });
      // the presenter's first load is the cookie exchange; follow it by hand
      const page =
        res.status === 303
          ? await fetch(`${base}/s/${s.id}`, { headers: { cookie: res.headers.get("set-cookie")!.split(";")[0]! } })
          : res;
      expect(bootOf(await page.text()).viewer).toBe(join);
    }
  });

  test("without one, a signed viewer link, never the raw viewer token a new placement replaces", async () => {
    const base = start();
    const s = await create(base);
    const boot = bootOf(await (await fetch(`${base}/s/${s.id}?t=${s.viewerToken}`)).text());
    expect(boot.viewer).toBe(`${base}/s/${s.id}?t=${s.viewerGrant}`);
    expect(String(boot.viewer)).not.toContain(s.viewerToken!);
    // and that link opens the deck
    expect((await fetch(String(boot.viewer))).status).toBe(200);
  });

  test("a join link that is not https (or local http) is ignored", async () => {
    const base = start();
    const s = await create(base, { "x-join-url": "http://evil.example.com/x" });
    const boot = bootOf(await (await fetch(`${base}/s/${s.id}?t=${s.viewerGrant}`)).text());
    expect(boot.viewer).toBe(`${base}/s/${s.id}?t=${s.viewerGrant}`);
  });
});

test("joinLink: https, or plain http on this machine or a private network", () => {
  expect(joinLink("https://app.liebstoeckel.app/live/abc")).toBe("https://app.liebstoeckel.app/live/abc");
  expect(joinLink("  https://a.b/live/x ")).toBe("https://a.b/live/x");
  expect(joinLink("http://localhost:3000/live/x")).toBe("http://localhost:3000/live/x");
  expect(joinLink("http://192.168.1.5:4321/live/x")).toBe("http://192.168.1.5:4321/live/x");
  expect(joinLink("http://example.com/live/x")).toBeUndefined();
  expect(joinLink("javascript:alert(1)")).toBeUndefined();
  expect(joinLink("https://user:pw@a.b/x")).toBeUndefined();
  expect(joinLink(`https://a.b/${"x".repeat(600)}`)).toBeUndefined();
  expect(joinLink(null)).toBeUndefined();
  expect(joinLink("not a url")).toBeUndefined();
});
