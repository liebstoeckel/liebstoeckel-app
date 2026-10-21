import { test, expect, describe, beforeAll } from "bun:test";
import { createRelay, type RelayServer } from "@liebstoeckel/present-relay";
import { browserSuite, buildFixture, chromiumAvailable, withPage, readCounter } from "./harness";

// Hosted live presenting, end-to-end in a real browser: an
// in-process relay serves a built deck to an audience under the opaque-sandbox CSP, and
// the deck must render live + carry the free-tier provenance watermark. Skips cleanly
// when Chromium is absent (the smoke tier's contract).
const hasChromium = chromiumAvailable();

let html = "";
beforeAll(async () => {
  // The relay serves decks stamped with an engine before 0.4 the old way (the presenter
  // token stays in the address, which their phone link needs). The workspace engine has
  // the 0.4 behaviour whatever version its package.json says until it is released, so the
  // fixture is stamped as what it is.
  if (hasChromium) html = (await buildFixture()).replace(/liebstoeckel engine \d+\.\d+\.\d+/g, "liebstoeckel engine 0.4.0");
}, 60_000);

describe(browserSuite("hosted live: audience renders the relay-served deck"), () => {
  test.skipIf(!hasChromium)(
    "the audience link loads the deck live and shows the provenance badge",
    async () => {
      const relay: RelayServer = createRelay({ accountTokens: ["e2e-token"], hostname: "127.0.0.1", port: 0 });
      try {
        const res = await fetch(`http://127.0.0.1:${relay.port}/api/sessions`, {
          method: "POST",
          headers: {
            authorization: "Bearer e2e-token",
            "content-type": "text/html",
            "x-live-enforce": "1",
            "x-watermark": "1",
          },
          body: html,
        });
        const s = (await res.json()) as { urls: { viewer: string } };

        await withPage({}, async (page) => {
          await page.goto(s.urls.viewer, { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(1500); // mount + live client connects to the relay
          const body = (await page.textContent("body")) ?? "";
          expect(body).toContain("Published with liebstoeckel"); // free-tier watermark
          expect(await readCounter(page)).not.toBe(""); // deck actually rendered
        });
      } finally {
        await relay.stop();
      }
    },
    90_000,
  );

  // Storage throws in the relay's opaque sandbox, so the relay keeps an audience member's
  // participant id (the id every vote is keyed by) in a cookie of its own and hands it to
  // the page. A reload and a re-opened join link must come back as the same participant
  // (or a poll would count them twice); the address copied to another browser must not
  // (or that person would vote as the first).
  test.skipIf(!hasChromium)(
    "a sandboxed viewer keeps its participant id in its browser, not in the address",
    async () => {
      const relay: RelayServer = createRelay({ accountTokens: ["e2e-token"], hostname: "127.0.0.1", port: 0 });
      try {
        const res = await fetch(`http://127.0.0.1:${relay.port}/api/sessions`, {
          method: "POST",
          headers: { authorization: "Bearer e2e-token", "content-type": "text/html" },
          body: html,
        });
        const s = (await res.json()) as { urls: { viewer: string } };
        expect(new URL(s.urls.viewer).searchParams.has("pid")).toBe(false); // the shared link stays id-free

        await withPage({}, async (page, errors) => {
          const sockets: string[] = [];
          page.on("websocket", (ws) => sockets.push(ws.url()));
          const participantOf = (u: string) => new URL(u).searchParams.get("p");

          await page.goto(s.urls.viewer, { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(1500);
          expect(sockets.length).toBeGreaterThan(0);
          const pid = participantOf(sockets.at(-1)!);
          expect(pid).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
          expect(new URL(page.url()).searchParams.has("pid")).toBe(false); // nothing to copy along
          expect(new URL(page.url()).searchParams.get("t")).toBe(new URL(s.urls.viewer).searchParams.get("t"));

          await page.reload({ waitUntil: "domcontentloaded" });
          await page.waitForTimeout(1500);
          await page.goto(s.urls.viewer, { waitUntil: "domcontentloaded" }); // the join link again
          await page.waitForTimeout(1500);
          expect(new Set(sockets.map(participantOf))).toEqual(new Set([pid]));
          expect(await readCounter(page)).not.toBe("");
          expect(errors.filter((e) => /SecurityError|replaceState/.test(e))).toEqual([]);

          // The address, copied into a chat (an old one may still carry the sender's `pid`),
          // opened in another browser: a participant of its own.
          const elsewhere = await page.context().browser()!.newContext();
          try {
            const other = await elsewhere.newPage();
            const otherSockets: string[] = [];
            other.on("websocket", (ws) => otherSockets.push(ws.url()));
            const copied = new URL(page.url());
            copied.searchParams.set("pid", pid!);
            await other.goto(copied.href, { waitUntil: "domcontentloaded" });
            await other.waitForTimeout(1500);
            expect(otherSockets.length).toBeGreaterThan(0);
            const otherPid = participantOf(otherSockets.at(-1)!);
            expect(otherPid).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
            expect(otherPid).not.toBe(pid);
            expect(new URL(other.url()).searchParams.has("pid")).toBe(false); // the sender's id is dropped
          } finally {
            await elsewhere.close();
          }
        });
      } finally {
        await relay.stop();
      }
    },
    90_000,
  );
});

// The presenter tab may be projected or screen-shared, so its address bar must not hold
// the presenter grant: the relay moves it into a cookie on the first load. A reload and
// the `P` pop-out still have to come back as the presenter.
describe(browserSuite("hosted live: the presenter grant stays out of the address bar"), () => {
  test.skipIf(!hasChromium)(
    "the presenter tab's URL has no grant after load; a reload and the pop-out stay presenter",
    async () => {
      const relay: RelayServer = createRelay({ accountTokens: ["e2e-token"], hostname: "127.0.0.1", port: 0 });
      try {
        const res = await fetch(`http://127.0.0.1:${relay.port}/api/sessions`, {
          method: "POST",
          headers: { authorization: "Bearer e2e-token", "content-type": "text/html" },
          body: html,
        });
        const s = (await res.json()) as { urls: { presenter: string } };
        const grant = new URL(s.urls.presenter).searchParams.get("t")!;
        const role = (page: { evaluate: (f: () => unknown) => Promise<unknown> }) =>
          page.evaluate(() => (globalThis as { __LIEBSTOECKEL_LIVE__?: { role: string } }).__LIEBSTOECKEL_LIVE__?.role);

        await withPage({}, async (page) => {
          await page.goto(s.urls.presenter, { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(1500);
          expect(page.url()).not.toContain(grant);
          expect(new URL(page.url()).searchParams.has("t")).toBe(false);
          expect(await role(page)).toBe("presenter");
          expect(await readCounter(page)).not.toBe("");

          await page.reload({ waitUntil: "domcontentloaded" });
          await page.waitForTimeout(1000);
          expect(new URL(page.url()).searchParams.has("t")).toBe(false);
          expect(await role(page)).toBe("presenter");

          const [popup] = await Promise.all([page.waitForEvent("popup"), page.keyboard.press("p")]);
          await popup.waitForLoadState("domcontentloaded");
          await popup.waitForTimeout(1000);
          expect(new URL(popup.url()).searchParams.has("t")).toBe(false);
          expect(new URL(popup.url()).hash).toBe("#presenter");
          expect(await role(popup)).toBe("presenter");
        });
      } finally {
        await relay.stop();
      }
    },
    90_000,
  );
});

// TLS is terminated at a proxy in front of the relay, so the relay itself serves plain
// http. What it must get right is the public scheme: every link it hands out, the
// socket URL injected into the deck and the deck's CSP `connect-src` all have to name
// https/wss, or the browser blocks the socket as mixed content. Local dev (no public
// URL, no forwarded headers) stays on plain ws://.
describe("relay behind a TLS proxy", () => {
  const upload = async (relay: RelayServer) => {
    const res = await fetch(`http://127.0.0.1:${relay.port}/api/sessions`, {
      method: "POST",
      headers: { authorization: "Bearer e2e-token", "content-type": "text/html" },
      body: "<!doctype html><html><head></head><body>deck</body></html>",
    });
    return (await res.json()) as { id: string; urls: { viewer: string; presenter: string; sync: string } };
  };
  const servedPage = async (relay: RelayServer, viewer: string, headers: Record<string, string> = {}) => {
    const u = new URL(viewer);
    const res = await fetch(`http://127.0.0.1:${relay.port}${u.pathname}${u.search}`, { headers });
    return { csp: res.headers.get("content-security-policy") ?? "", body: await res.text() };
  };

  test("a public https URL puts https/wss into the links, the deck bootstrap and its CSP", async () => {
    const relay = createRelay({ accountTokens: ["e2e-token"], hostname: "127.0.0.1", port: 0, publicBaseUrl: "https://relay.example" });
    try {
      const s = await upload(relay);
      expect(s.urls.viewer.startsWith("https://relay.example/s/")).toBe(true);
      expect(s.urls.presenter.startsWith("https://relay.example/s/")).toBe(true);
      expect(s.urls.sync).toBe(`wss://relay.example/sync/${s.id}`);
      const page = await servedPage(relay, s.urls.viewer);
      expect(page.csp).toContain("connect-src wss://relay.example https://relay.example");
      expect(page.body).toContain(`wss://relay.example/sync/${s.id}`);
      expect(page.body).not.toContain("ws://127.0.0.1");
    } finally {
      await relay.stop();
    }
  });

  test("forwarded https from the proxy works without a configured public URL; plain http stays ws://", async () => {
    const relay = createRelay({ accountTokens: ["e2e-token"], hostname: "127.0.0.1", port: 0 });
    try {
      const s = await upload(relay);
      const tls = await servedPage(relay, s.urls.viewer, { "x-forwarded-proto": "https", "x-forwarded-host": "live.example" });
      expect(tls.csp).toContain("connect-src wss://live.example https://live.example");
      expect(tls.body).toContain(`wss://live.example/sync/${s.id}`);
      const plain = await servedPage(relay, s.urls.viewer);
      expect(plain.csp).toContain(`connect-src ws://127.0.0.1:${relay.port}`);
    } finally {
      await relay.stop();
    }
  });
});
