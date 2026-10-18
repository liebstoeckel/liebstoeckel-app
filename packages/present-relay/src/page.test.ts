import { test, expect, describe, afterEach } from "bun:test";
import zlib from "node:zlib";
import { injectBootstrap, injectWatermark, audienceScopeFromHtml, type LiveBootstrap } from "@liebstoeckel/live-server";
import { createRelay, type RelayServer } from "./relay-server";
import { stripThumbnails, THUMBS_ATTR } from "@liebstoeckel/engine/build/thumbnails";
import { acceptsGzip, audienceHtml, crc32Combine, notModified, pageEtag, preparePage, THUMBNAILS_ATTR } from "./page";

const TOKEN = "acct-secret-token";

const THUMBS = `<script type="application/json" data-liebstoeckel-thumbnails>{"v":1,"w":4,"h":3,"thumbs":{"0":"data:image/jpeg;base64,${"A".repeat(4000)}"}}</script>`;
const LICENSES = `<script type="text/plain" data-liebstoeckel-licenses>\nTHIRD-PARTY SOFTWARE NOTICES\nfoo (MIT)\n</script>`;
const SOURCE = `<script type="application/octet-stream" data-liebstoeckel-source data-codec="zstd">KLUv/QA=</script>`;
const MANIFEST = `<script type="application/json" data-liebstoeckel-plugins>{"v":1,"plugins":[]}</script>`;
// The engine's own bundle mentions the attribute in its code; only the block goes.
const BUNDLE = `<script type="module">document.querySelector("script[data-liebstoeckel-thumbnails]");${"let x=1;".repeat(2000)}</script>`;
const DECK = `<!doctype html><html><head><meta name="generator" content="liebstoeckel engine 0.4.0" /><title>deck</title>${BUNDLE}</head><body><div id=root></div>${MANIFEST}${LICENSES}${SOURCE}${THUMBS}</body></html>`;

const BOOT: LiveBootstrap = {
  ws: "wss://live.example/sync/s1?t=grant",
  session: "s1",
  role: "viewer",
  token: "grant",
  participant: "0b6f0c5e-6d7a-4a6e-9a43-0d1f2e3a4b5c",
  viewer: "https://live.example/s/s1?t=raw",
};

describe("crc32Combine", () => {
  test("matches a CRC over the joined bytes", () => {
    for (const [a, b] of [
      ["", "x"],
      ["hello ", "world"],
      ["a".repeat(70_000), "b".repeat(123_457)],
      ["x", ""],
    ] as const) {
      const whole = zlib.crc32(Buffer.from(a + b));
      expect(crc32Combine(zlib.crc32(Buffer.from(a)), zlib.crc32(Buffer.from(b)), Buffer.byteLength(b))).toBe(whole);
    }
  });
});

describe("prepared page", () => {
  test("its gzip body decodes to exactly what injectBootstrap writes", () => {
    for (const html of [DECK, "<html><body>no head</body></html>", "plain text, no tags", "<p>é ü 漢字</p></head>"]) {
      const page = preparePage(html);
      const want = injectBootstrap(html, BOOT);
      expect(zlib.gunzipSync(page.gzip(BOOT)).toString("utf8")).toBe(want);
      expect(page.text(BOOT)).toBe(want);
    }
  });

  test("the bootstrap is compressed on its own: its size does not depend on the page", () => {
    // Nothing on the page shares a compression window with the grant, so the size of a
    // response says nothing about how much of the grant the page repeats (no BREACH-style
    // guessing through content on the page).
    const echoed = "<title>deck</title>"; // on DECK, not on the other page
    const other = "q7Zx!kP2#vN9wR4$mL1";
    const delta = (html: string) => {
      const page = preparePage(html);
      return page.gzip({ ...BOOT, token: echoed }).byteLength - page.gzip({ ...BOOT, token: other }).byteLength;
    };
    expect(delta(DECK)).toBe(delta("<html><head></head><body>nothing alike</body></html>"));
  });

  test("the audience copy drops the thumbnails and keeps everything else", () => {
    const copy = audienceHtml(DECK);
    expect(copy).not.toContain("data:image/jpeg");
    expect(copy).toContain(MANIFEST);
    expect(copy).toContain(LICENSES);
    expect(copy).toContain(SOURCE);
    expect(copy).toContain(BUNDLE);
    expect(audienceScopeFromHtml(copy)).toEqual(audienceScopeFromHtml(DECK));
  });

  test("it finds the block the way the engine's build writes and strips it", () => {
    expect(THUMBNAILS_ATTR).toBe(THUMBS_ATTR);
    expect(audienceHtml(DECK)).toBe(stripThumbnails(DECK));
  });
});

describe("request helpers", () => {
  test("acceptsGzip", () => {
    expect(acceptsGzip("gzip, deflate, br")).toBe(true);
    expect(acceptsGzip("br;q=1.0, gzip;q=0.8")).toBe(true);
    expect(acceptsGzip("*")).toBe(true);
    expect(acceptsGzip("gzip;q=0")).toBe(false);
    expect(acceptsGzip("br")).toBe(false);
    expect(acceptsGzip("identity")).toBe(false);
    expect(acceptsGzip(null)).toBe(false);
  });

  test("the validator follows the viewer and the policy", () => {
    const page = preparePage(DECK);
    const e = pageEtag(page, BOOT, "csp");
    expect(e).toMatch(/^W\/"[A-Za-z0-9_-]{27}"$/);
    expect(pageEtag(preparePage(DECK), BOOT, "csp")).toBe(e);
    expect(pageEtag(page, { ...BOOT, participant: "another-participant" }, "csp")).not.toBe(e);
    expect(pageEtag(page, { ...BOOT, token: "other" }, "csp")).not.toBe(e);
    expect(pageEtag(page, BOOT, "csp2")).not.toBe(e);
    expect(pageEtag(preparePage(DECK + " "), BOOT, "csp")).not.toBe(e);
    expect(notModified(e, e)).toBe(true);
    expect(notModified(`"zzz", ${e.slice(2)}`, e)).toBe(true);
    expect(notModified("*", e)).toBe(true);
    expect(notModified(`W/"other"`, e)).toBe(false);
    expect(notModified(null, e)).toBe(false);
  });
});

describe("the relay's deck page", () => {
  let relay: RelayServer | null = null;
  afterEach(async () => {
    await relay?.stop();
    relay = null;
  });

  async function session(extra: Record<string, string> = {}) {
    relay = createRelay({ accountTokens: [TOKEN], hostname: "127.0.0.1", port: 0 });
    const base = `http://127.0.0.1:${relay.port}`;
    const res = await fetch(`${base}/api/sessions`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "text/html", ...extra },
      body: DECK,
    });
    const body = (await res.json()) as { id: string; urls: { viewer: string; presenter: string } };
    return { base, ...body };
  }

  // Bun's fetch decodes gzip by itself; `decompress: false` shows the bytes on the wire.
  const raw = (url: string, headers: Record<string, string> = {}) =>
    fetch(url, { headers, redirect: "manual", decompress: false } as RequestInit);

  const cookieOf = (res: Response) => res.headers.get("set-cookie")!.split(";")[0]!;

  test("a viewer gets the audience copy gzip-encoded, the same page as without gzip", async () => {
    const s = await session({ "x-watermark": "1" });
    const gz = await raw(s.urls.viewer, { "accept-encoding": "gzip, deflate, br" });
    expect(gz.status).toBe(200);
    expect(gz.headers.get("content-encoding")).toBe("gzip");
    expect(gz.headers.get("vary")).toBe("Accept-Encoding");
    expect(gz.headers.get("cache-control")).toBe("private, no-cache");
    expect(gz.headers.get("content-security-policy")).toContain("sandbox allow-scripts allow-popups");
    const wire = new Uint8Array(await gz.arrayBuffer());
    const page = zlib.gunzipSync(wire).toString("utf8");
    expect(wire.byteLength).toBeLessThan(page.length / 2);
    // Same browser (its cookie), no gzip: the same page as plain text.
    const plain = await raw(s.urls.viewer, { "accept-encoding": "identity", cookie: cookieOf(gz) });
    expect(plain.headers.get("content-encoding")).toBeNull();
    expect(await plain.text()).toBe(page);
    expect(plain.headers.get("etag")).toBe(gz.headers.get("etag"));
    // What it holds: no thumbnails, the watermark, every other block, the bootstrap.
    expect(page).not.toContain("data:image/jpeg");
    expect(page).toContain("Published with liebstoeckel");
    for (const block of [MANIFEST, LICENSES, SOURCE, BUNDLE]) expect(page).toContain(block);
    expect(page).toContain(`window.__LIEBSTOECKEL_LIVE__=`);
    expect(page).toContain(`"role":"viewer"`);
  });

  test("a reload with the validator is a 304; another browser or a changed cookie gets the page", async () => {
    const s = await session();
    const first = await raw(s.urls.viewer, { "accept-encoding": "gzip" });
    const etag = first.headers.get("etag")!;
    const cookie = cookieOf(first);
    expect(etag).toMatch(/^W\/"/);

    const again = await raw(s.urls.viewer, { "accept-encoding": "gzip", cookie, "if-none-match": etag });
    expect(again.status).toBe(304);
    expect(again.headers.get("etag")).toBe(etag);
    expect(again.headers.get("set-cookie")).toContain(cookie);
    expect((await again.arrayBuffer()).byteLength).toBe(0);

    // The validator without the cookie it belongs to: a new participant, a new page.
    const elsewhere = await raw(s.urls.viewer, { "accept-encoding": "gzip", "if-none-match": etag });
    expect(elsewhere.status).toBe(200);
    expect(elsewhere.headers.get("etag")).not.toBe(etag);
  });

  test("an ended talk answers a stored validator with 403, never with 304", async () => {
    const s = await session();
    const first = await raw(s.urls.viewer, { "accept-encoding": "gzip" });
    const etag = first.headers.get("etag")!;
    const cookie = cookieOf(first);
    const end = await fetch(`${s.base}/api/sessions/${s.id}`, { method: "DELETE", headers: { authorization: `Bearer ${TOKEN}` } });
    expect(end.status).toBe(204);
    const after = await raw(s.urls.viewer, { "accept-encoding": "gzip", cookie, "if-none-match": etag });
    expect(after.status).toBe(403);
    expect(after.headers.get("cache-control")).toBe("no-store, private");
  });

  test("the presenter gets the deck as uploaded, compressed, never stored, never 304", async () => {
    const s = await session({ "x-watermark": "1" });
    const hop = await raw(s.urls.presenter);
    expect(hop.status).toBe(303);
    const cookie = cookieOf(hop);
    const url = new URL(hop.headers.get("location")!, s.base).href;
    const res = await raw(url, { "accept-encoding": "gzip", cookie, "if-none-match": "*" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-encoding")).toBe("gzip");
    expect(res.headers.get("cache-control")).toBe("no-store, private");
    expect(res.headers.get("vary")).toBe("Cookie, Accept-Encoding");
    expect(res.headers.get("etag")).toBeNull();
    const page = zlib.gunzipSync(new Uint8Array(await res.arrayBuffer())).toString("utf8");
    expect(page).toContain("data:image/jpeg");
    expect(page).not.toContain("Published with liebstoeckel");
    const boot = /window\.__LIEBSTOECKEL_LIVE__=(\{.*?\})<\/script>/.exec(page)![1]!;
    expect(page).toBe(injectBootstrap(DECK, JSON.parse(boot) as LiveBootstrap));
  });

  test("the watermark goes into the audience copy only on free sessions", async () => {
    const s = await session();
    const res = await raw(s.urls.viewer, { "accept-encoding": "gzip" });
    const page = zlib.gunzipSync(new Uint8Array(await res.arrayBuffer())).toString("utf8");
    expect(page).not.toContain("Published with liebstoeckel");
    expect(injectWatermark(DECK)).toContain("Published with liebstoeckel");
  });
});
