import { test, expect, describe, afterEach } from "bun:test";
import * as Y from "yjs";
import { startServer, type LiveServer } from "./server";
import { embedManifest, encodeServerBundle, type PluginManifest } from "./manifest";
import { classifyTargetPath } from "./cli";

const BASE_HTML = "<html><head><title>deck</title></head><body><div id=root></div></body></html>";

let live: LiveServer | null = null;
afterEach(() => {
  live?.stop();
  live = null;
});

const wsRecv = (url: string): Promise<{ ws: WebSocket; first: Promise<Uint8Array> }> =>
  new Promise((res, rej) => {
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    const first = new Promise<Uint8Array>((r) => {
      ws.addEventListener("message", (e) => r(new Uint8Array(e.data as ArrayBuffer)), { once: true });
    });
    ws.addEventListener("open", () => res({ ws, first }));
    ws.addEventListener("error", rej);
  });

describe("startServer HTTP gating", () => {
  test("serves deck with bootstrap for valid token, 403 for invalid", async () => {
    live = await startServer({ html: BASE_HTML, hostname: "127.0.0.1", publicHost: "127.0.0.1" });
    const ok = await fetch(`${live.baseUrl}/?t=${live.session.viewerToken}`);
    const body = await ok.text();
    expect(ok.status).toBe(200);
    expect(body).toContain("window.__LIEBSTOECKEL_LIVE__");
    expect(body).toContain('"role":"viewer"');
    expect(body).toContain('"viewer":"http'); // read-only link for the QR

    const bad = await fetch(`${live.baseUrl}/?t=wrong`);
    expect(bad.status).toBe(403);
  });
});

describe("WebSocket relay over the wire", () => {
  test("two clients sync a Yjs change through the server", async () => {
    live = await startServer({ html: BASE_HTML, hostname: "127.0.0.1", publicHost: "127.0.0.1" });
    const url = `ws://127.0.0.1:${live.port}/sync?t=${live.session.viewerToken}`;

    const a = await wsRecv(url);
    await a.first; // initial full-state
    const b = await wsRecv(url);
    await b.first;

    const got = new Promise<Uint8Array>((r) =>
      b.ws.addEventListener("message", (e) => r(new Uint8Array(e.data as ArrayBuffer)), { once: true }),
    );

    // client A produces a Yjs update and sends it
    const local = new Y.Doc();
    local.getMap("plugin:poll").set("v", 42);
    a.ws.send(new Uint8Array(Y.encodeStateAsUpdate(local)));

    const update = await got;
    const mirror = new Y.Doc();
    Y.applyUpdate(mirror, update);
    expect(mirror.getMap("plugin:poll").get("v")).toBe(42);
    expect(live.hub.doc.getMap("plugin:poll").get("v")).toBe(42);

    a.ws.close();
    b.ws.close();
  });

  test("WS rejects an invalid token", async () => {
    live = await startServer({ html: BASE_HTML, hostname: "127.0.0.1", publicHost: "127.0.0.1" });
    const res = await fetch(`${live.baseUrl}/sync?t=bad`, { headers: { upgrade: "websocket" } });
    expect(res.status).toBe(403);
  });
});

describe("server plugin rehydration", () => {
  test("runs an embedded server bundle against the shared doc on startup", async () => {
    const manifest: PluginManifest = {
      v: 1,
      plugins: [
        {
          name: "@acme/seed",
          version: "1.0.0",
          hasServer: true,
          // server bundle: seed the doc on session start
          server: encodeServerBundle(
            `export default (ctx) => { ctx.doc.getMap("plugin:seed").set("ready", true); };`,
          ),
        },
      ],
    };
    const html = embedManifest(BASE_HTML, manifest);
    live = await startServer({ html, hostname: "127.0.0.1", publicHost: "127.0.0.1" });
    expect(live.serverPlugins).toEqual(["@acme/seed"]);
    expect(live.hub.doc.getMap("plugin:seed").get("ready")).toBe(true);
  });
});

describe("classifyTargetPath", () => {
  test("detects html vs project vs unknown", () => {
    expect(classifyTargetPath("deck.html", false)).toBe("html");
    expect(classifyTargetPath("/x/package.json", false)).toBe("project");
    expect(classifyTargetPath("/x/deck-dir", true)).toBe("project");
    expect(classifyTargetPath("notes.txt", false)).toBe("unknown");
  });
});
