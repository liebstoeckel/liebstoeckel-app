import { afterEach, describe, expect, test } from "bun:test";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import * as Y from "yjs";
import { SyncClient, type SyncStatus } from "./client.ts";
import { CLOSE, MSG_AWARENESS, MSG_READY, SYNC_PROTOCOL, decodeFrame, encodeFrame } from "./wire.ts";

/** A sync server stand-in: sends READY, then closes each connection as told. */
function server(closeWith: (n: number) => { code: number; notice?: string } | null) {
  const seen: Array<{ at: number; v: string | null }> = [];
  const srv = Bun.serve({
    port: 0,
    fetch(req, s) {
      seen.push({ at: performance.now(), v: new URL(req.url).searchParams.get("v") });
      return s.upgrade(req) ? undefined : new Response("no", { status: 400 });
    },
    websocket: {
      open(ws) {
        ws.sendBinary(encodeFrame(MSG_READY));
        const close = closeWith(seen.length);
        if (!close) return;
        if (close.notice) ws.send(JSON.stringify({ type: "error", message: close.notice }));
        ws.close(close.code, "bye");
      },
      message() {},
    },
  });
  stops.push(() => srv.stop(true));
  return { url: `ws://127.0.0.1:${srv.port}/d/deck/ws?t=grant`, seen };
}

const stops: Array<() => void> = [];
afterEach(() => {
  for (const s of stops.splice(0)) s();
});

const until = async (cond: () => boolean, ms = 3_000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timed out");
    await Bun.sleep(5);
  }
};

describe("SyncClient", () => {
  test("sends its protocol version", async () => {
    const s = server(() => null);
    const c = new SyncClient({ url: s.url });
    stops.push(() => c.close());
    await c.ready;
    expect(s.seen[0]!.v).toBe(String(SYNC_PROTOCOL));
  });

  for (const code of [CLOSE.RESTARTING, CLOSE.MOVED, CLOSE.GRANT_EXPIRED]) {
    test(`reconnects at once, without backoff, after close ${code}`, async () => {
      const s = server((n) => (n <= 3 ? { code } : null));
      const c = new SyncClient({ url: s.url });
      stops.push(() => c.close());
      await until(() => s.seen.length >= 4);
      const gaps = s.seen.slice(1).map((x, i) => x.at - s.seen[i]!.at);
      expect(Math.max(...gaps)).toBeLessThan(200); // any other close waits 250 ms or more
    });
  }

  test("stops for good when the server no longer speaks its protocol, and says why", async () => {
    const message = "This client is too old for the server. Update the CLI or reload the page.";
    const s = server(() => ({ code: CLOSE.PROTOCOL_TOO_OLD, notice: message }));
    const statuses: SyncStatus[] = [];
    let fatal: string | null = null;
    const c = new SyncClient({ url: s.url, onStatus: (st) => statuses.push(st), onFatal: (m) => (fatal = m) });
    stops.push(() => c.close());
    await until(() => fatal !== null);
    expect(fatal as string | null).toBe(message);
    expect(statuses.at(-1)).toBe("failed");
    await Bun.sleep(400);
    expect(s.seen).toHaveLength(1);
  });

  test("other closes wait for the backoff", async () => {
    const s = server((n) => (n <= 2 ? { code: 1011 } : null));
    const c = new SyncClient({ url: s.url });
    stops.push(() => c.close());
    await until(() => s.seen.length >= 3);
    const gaps = s.seen.slice(1).map((x, i) => x.at - s.seen[i]!.at);
    expect(Math.min(...gaps)).toBeGreaterThan(240);
  });
});

/** A sync server stand-in with more say: refuse an upgrade, skip READY, or keep
 *  presence the way the sync service does (dropped when a socket closes, its clock
 *  remembered). */
function flexServer(plan: (n: number) => { refuse?: number; ready?: boolean; close?: number } = () => ({})) {
  const seen: Array<{ at: number }> = [];
  const awareness = new Awareness(new Y.Doc());
  const srv = Bun.serve<{ n: number; clients: Set<number> }>({
    port: 0,
    fetch(req, s) {
      seen.push({ at: performance.now() });
      const n = seen.length;
      const step = plan(n);
      if (step.refuse) return new Response("no", { status: step.refuse });
      return s.upgrade(req, { data: { n, clients: new Set<number>() } }) ? undefined : new Response("no", { status: 400 });
    },
    websocket: {
      open(ws) {
        const step = plan(ws.data.n);
        if (step.ready !== false) {
          const states = [...awareness.getStates().keys()];
          if (states.length > 0) ws.sendBinary(encodeFrame(MSG_AWARENESS, encodeAwarenessUpdate(awareness, states)));
          ws.sendBinary(encodeFrame(MSG_READY));
        }
        if (step.close) ws.close(step.close, "bye");
      },
      message(ws, message) {
        if (typeof message === "string") return;
        const frame = decodeFrame(new Uint8Array(message));
        if (frame?.type !== MSG_AWARENESS) return;
        const before = new Set(awareness.getStates().keys());
        applyAwarenessUpdate(awareness, frame.payload, ws);
        for (const id of awareness.getStates().keys()) if (!before.has(id)) ws.data.clients.add(id);
      },
      close(ws) {
        if (ws.data.clients.size > 0) removeAwarenessStates(awareness, [...ws.data.clients], null);
      },
    },
  });
  stops.push(() => srv.stop(true));
  const url = `ws://127.0.0.1:${srv.port}/d/deck/ws?t=grant`;
  const gaps = () => seen.slice(1).map((x, i) => x.at - seen[i]!.at);
  return { url, seen, gaps, awareness, kick: () => srv.stop(true) };
}

describe("SyncClient reconnects", () => {
  test("a server that closes right after READY is asked again with a growing backoff, not every 250 ms", async () => {
    const s = flexServer((n) => (n <= 3 ? { close: 1011 } : {}));
    const c = new SyncClient({ url: s.url });
    stops.push(() => c.close());
    await until(() => s.seen.length >= 4, 5_000);
    const gaps = s.gaps();
    expect(gaps[2]!).toBeGreaterThan(900); // 250, 500, then 1000 ms and up
  });

  test("the backoff is spread at random, so a deck's editors do not come back together", async () => {
    const realRandom = Math.random;
    Math.random = () => 0.99;
    try {
      const s = flexServer((n) => (n <= 1 ? { close: 1011 } : {}));
      const c = new SyncClient({ url: s.url });
      stops.push(() => c.close());
      await until(() => s.seen.length >= 2);
      expect(s.gaps()[0]!).toBeGreaterThan(350); // 250 ms and up to half again
    } finally {
      Math.random = realRandom;
    }
  });

  test("moved before READY (the deck is still being placed): quick retries, not a tight loop", async () => {
    const s = flexServer((n) => (n <= 3 ? { ready: false, close: CLOSE.MOVED } : {}));
    const c = new SyncClient({ url: s.url });
    stops.push(() => c.close());
    await c.ready;
    expect(s.seen).toHaveLength(4);
    const gaps = s.gaps();
    expect(Math.min(...gaps)).toBeGreaterThan(450);
    expect(Math.max(...gaps)).toBeLessThan(1_200);
  });

  test("the network coming back cuts a pending backoff short", async () => {
    const s = flexServer((n) => (n <= 4 ? { refuse: 503 } : {}));
    const c = new SyncClient({ url: s.url });
    stops.push(() => c.close());
    await until(() => s.seen.length >= 4, 5_000); // the next wait is 2 s and more
    await Bun.sleep(50);
    globalThis.dispatchEvent(new Event("online"));
    await until(() => s.seen.length >= 5, 500);
  });

  test("close() clears a pending reconnect", async () => {
    const s = flexServer(() => ({ close: 1011 }));
    const statuses: SyncStatus[] = [];
    const c = new SyncClient({ url: s.url, onStatus: (st) => statuses.push(st) });
    await until(() => statuses.includes("closed"));
    const cleared: unknown[] = [];
    const realClear = globalThis.clearTimeout;
    globalThis.clearTimeout = ((t: unknown) => {
      cleared.push(t);
      realClear(t as ReturnType<typeof setTimeout>);
    }) as typeof clearTimeout;
    try {
      c.close();
    } finally {
      globalThis.clearTimeout = realClear;
    }
    expect(cleared).toHaveLength(1);
  });

  test("asks for a fresh grant after the server closed for an expired one, or refused the upgrade", async () => {
    const s = flexServer((n) => (n === 1 ? { close: CLOSE.GRANT_EXPIRED } : n === 2 ? { refuse: 401 } : {}));
    const asked: boolean[] = [];
    const c = new SyncClient({
      url: ({ renewGrant }) => {
        asked.push(renewGrant);
        return s.url;
      },
    });
    stops.push(() => c.close());
    await until(() => s.seen.length >= 3, 5_000);
    await until(() => c.isReady);
    expect(asked.slice(0, 3)).toEqual([false, true, true]);
    s.kick(); // a plain drop of a working connection: the grant is still good
    await until(() => asked.length >= 4, 5_000);
    expect(asked[3]).toBe(false);
  });

  test("its presence is back on the server right after a reconnect, not only at the next renewal", async () => {
    const s = flexServer();
    const c = new SyncClient({ url: s.url });
    stops.push(() => c.close());
    c.awareness.setLocalState({ user: { name: "Ada" } });
    await until(() => s.awareness.getStates().has(c.doc.clientID));
    // Drop the socket from the client side, as a network change would.
    (c as unknown as { ws: WebSocket }).ws.close(4999, "drop");
    await until(() => !s.awareness.getStates().has(c.doc.clientID));
    await until(() => s.awareness.getStates().has(c.doc.clientID), 3_000);
    expect(s.awareness.getStates().get(c.doc.clientID)).toEqual({ user: { name: "Ada" } });
  });
});
