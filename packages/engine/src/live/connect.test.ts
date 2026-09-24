import { test, expect, describe } from "bun:test";
import * as Y from "yjs";
import { connectLive } from "./connect";
import { LIVE_CLOSE, LIVE_PROTOCOL, type LiveState } from "./protocol";

// Minimal WebSocket stand-in so we can unit-test connect without a server.
class MockWS {
  CONNECTING = 0;
  OPEN = 1;
  /** A hung server: closing never completes, so no close event. */
  hung = false;
  readyState = 0;
  binaryType = "blob";
  sent: Uint8Array[] = [];
  private listeners: Record<string, Array<(e?: unknown) => void>> = {};
  constructor(public url: string) {}
  addEventListener(type: string, cb: (e?: unknown) => void) {
    (this.listeners[type] ??= []).push(cb);
  }
  send(d: Uint8Array) {
    this.sent.push(d);
  }
  close() {
    if (this.hung) {
      this.readyState = 2; // CLOSING, forever
      return;
    }
    this.readyState = 3;
    this.emit("close");
  }
  /** The server closes the socket with a code. */
  serverClose(code: number, reason = "") {
    this.readyState = 3;
    this.emit("close", { code, reason });
  }
  // test drivers
  open() {
    this.readyState = 1;
    this.emit("open");
  }
  deliver(bytes: Uint8Array) {
    const copy = new Uint8Array(bytes);
    this.emit("message", { data: copy.buffer });
  }
  private emit(type: string, e?: unknown) {
    (this.listeners[type] ?? []).forEach((cb) => cb(e));
  }
}

const info = { ws: "ws://h/sync?t=tok", session: "s", role: "viewer" as const, token: "tok" };

describe("connectLive (mock WS)", () => {
  test("pushes state on open, applies incoming, forwards local updates", () => {
    const created: MockWS[] = [];
    const WS = function (url: string) {
      const s = new MockWS(url);
      created.push(s);
      return s;
    } as unknown as typeof WebSocket;

    let connected = false;
    const conn = connectLive(info, "p9", { WS, staleMs: 0 });
    conn.onStatus((c) => (connected = c));
    const sock = created[0]!;

    expect(sock.url).toContain("p=p9"); // participant appended
    sock.open();
    expect(connected).toBe(true);
    expect(sock.sent.length).toBe(1); // initial state push

    const ext = new Y.Doc();
    ext.getMap("plugin:poll").set("k", 5);
    const before = sock.sent.length;
    sock.deliver(Y.encodeStateAsUpdate(ext));
    expect(conn.doc.getMap("plugin:poll").get("k")).toBe(5);
    expect(sock.sent.length).toBe(before); // remote-origin → no echo

    conn.doc.getMap("plugin:poll").set("z", 9);
    expect(sock.sent.length).toBe(before + 1); // local change forwarded

    conn.close();
  });

  test("ignores a malformed incoming frame without throwing", () => {
    const created: MockWS[] = [];
    const WS = function (url: string) {
      const s = new MockWS(url);
      created.push(s);
      return s;
    } as unknown as typeof WebSocket;
    const conn = connectLive(info, "p", { WS, staleMs: 0 });
    created[0]!.open();
    expect(() => created[0]!.deliver(new Uint8Array([1, 2, 3, 255, 99]))).not.toThrow();
    conn.close();
  });

  test("auto-reconnects after a close, and stop() halts reconnection", async () => {
    const created: MockWS[] = [];
    const WS = function (url: string) {
      const s = new MockWS(url);
      created.push(s);
      return s;
    } as unknown as typeof WebSocket;

    const conn = connectLive(info, "p", { WS, reconnectBaseMs: 10, reconnectMaxMs: 20, staleMs: 0 });
    created[0]!.open();
    expect(created.length).toBe(1);

    created[0]!.close(); // network blip
    await Bun.sleep(40);
    expect(created.length).toBeGreaterThanOrEqual(2); // reconnected with a fresh socket

    const countAfterClose = created.length;
    conn.close(); // explicit close
    created[countAfterClose - 1]!.close();
    await Bun.sleep(40);
    expect(created.length).toBe(countAfterClose); // no further reconnect attempts
  });

  test("watchdog force-reconnects a half-open socket (no frames within staleMs)", async () => {
    const created: MockWS[] = [];
    const WS = function (url: string) {
      const s = new MockWS(url);
      created.push(s);
      return s;
    } as unknown as typeof WebSocket;

    const conn = connectLive(info, "p", { WS, reconnectBaseMs: 10, reconnectMaxMs: 20, staleMs: 60 });
    created[0]!.open(); // connected, but no frames ever arrive (half-open)
    await Bun.sleep(180);
    expect(created.length).toBeGreaterThanOrEqual(2); // watchdog closed the stale socket → reconnect
    conn.close();
  });
});

describe("connectLive recovery escalation ((internal ticket))", () => {
  test("fires onUnrecoverable once after N consecutive failed reconnects", async () => {
    const created: MockWS[] = [];
    const WS = function (url: string) {
      const s = new MockWS(url);
      created.push(s);
      queueMicrotask(() => s.close()); // simulate connection refused (session gone)
      return s;
    } as unknown as typeof WebSocket;

    let recovered = 0;
    const conn = connectLive(info, "p", {
      WS,
      staleMs: 0,
      reconnectBaseMs: 1,
      reconnectMaxMs: 1,
      reloadAfterAttempts: 3,
      onUnrecoverable: () => recovered++,
    });

    await new Promise((r) => setTimeout(r, 80));
    expect(recovered).toBe(1); // escalated exactly once
    expect(created.length).toBeGreaterThanOrEqual(3); // retried, then gave up
    conn.close();
  });

  test("a successful open resets the attempt counter (no false escalation)", async () => {
    const created: MockWS[] = [];
    const WS = function (url: string) {
      const s = new MockWS(url);
      created.push(s);
      return s;
    } as unknown as typeof WebSocket;
    let recovered = 0;
    const conn = connectLive(info, "p", {
      WS,
      staleMs: 0,
      reconnectBaseMs: 1,
      reloadAfterAttempts: 2,
      onUnrecoverable: () => recovered++,
    });
    created[0]!.open(); // immediate success resets attempt to 0
    await new Promise((r) => setTimeout(r, 30));
    expect(recovered).toBe(0);
    conn.close();
  });
});

describe("connectLive close codes and protocol version", () => {
  const factory = () => {
    const created: MockWS[] = [];
    const WS = function (url: string) {
      const s = new MockWS(url);
      created.push(s);
      return s;
    } as unknown as typeof WebSocket;
    return { created, WS };
  };

  test("sends its protocol version", () => {
    const { created, WS } = factory();
    const conn = connectLive(info, "p", { WS, staleMs: 0 });
    expect(new URL(created[0]!.url).searchParams.get("v")).toBe(String(LIVE_PROTOCOL));
    conn.close();
  });

  for (const code of [LIVE_CLOSE.RESTARTING, LIVE_CLOSE.MOVED, LIVE_CLOSE.GRANT_EXPIRED]) {
    test(`reconnects at once after close ${code}, even after failures`, async () => {
      const { created, WS } = factory();
      // A long backoff: only an immediate reconnect makes it within the test.
      const conn = connectLive(info, "p", { WS, staleMs: 0, reconnectBaseMs: 5000, reconnectMaxMs: 5000 });
      const states: string[] = [];
      conn.onState((s) => states.push(s.status));
      created[0]!.open();
      created[0]!.serverClose(code);
      await Bun.sleep(400);
      expect(created.length).toBe(2);
      created[1]!.open();
      expect(states).toEqual(["connecting", "connected", "reconnecting", "connected"]);
      conn.close();
    });
  }

  test("after a planned close, failed reconnects retry quickly instead of backing off", async () => {
    const created: MockWS[] = [];
    let refuse = false;
    const WS = function (url: string) {
      const s = new MockWS(url);
      created.push(s);
      if (refuse) queueMicrotask(() => s.close()); // the talk is not placed again yet
      return s;
    } as unknown as typeof WebSocket;
    const conn = connectLive(info, "p", { WS, staleMs: 0, reconnectBaseMs: 5000, reconnectMaxMs: 5000, quickRetryMs: 20 });
    created[0]!.open();
    refuse = true;
    created[0]!.serverClose(LIVE_CLOSE.RESTARTING);
    await Bun.sleep(400);
    // With a 5 s backoff there would be one attempt; quick retries make several.
    expect(created.length).toBeGreaterThan(5);
    refuse = false;
    await Bun.sleep(100);
    created.at(-1)!.open();
    // Back to normal: a plain drop now backs off again.
    const before = created.length;
    created.at(-1)!.serverClose(1006);
    await Bun.sleep(300);
    expect(created.length).toBe(before);
    conn.close();
  });

  test("the quick retries end after their window", async () => {
    const created: MockWS[] = [];
    const WS = function (url: string) {
      const s = new MockWS(url);
      created.push(s);
      if (created.length > 1) queueMicrotask(() => s.close());
      return s;
    } as unknown as typeof WebSocket;
    const conn = connectLive(info, "p", { WS, staleMs: 0, reconnectBaseMs: 5000, reconnectMaxMs: 5000, quickRetryMs: 10, quickRetryWindowMs: 150 });
    created[0]!.open();
    created[0]!.serverClose(LIVE_CLOSE.MOVED);
    await Bun.sleep(400);
    const settled = created.length;
    await Bun.sleep(300);
    expect(created.length).toBe(settled); // backing off now
    conn.close();
  });

  test("a plain drop backs off", async () => {
    const { created, WS } = factory();
    const conn = connectLive(info, "p", { WS, staleMs: 0, reconnectBaseMs: 5000, reconnectMaxMs: 5000 });
    created[0]!.open();
    created[0]!.serverClose(1006);
    await Bun.sleep(400);
    expect(created.length).toBe(1);
    conn.close();
  });

  test("ended: stops for good and keeps the doc readable", async () => {
    const { created, WS } = factory();
    const conn = connectLive(info, "p", { WS, staleMs: 0, reconnectBaseMs: 1, reconnectMaxMs: 1 });
    let state: LiveState | undefined;
    conn.onState((s) => (state = s));
    created[0]!.open();
    conn.doc.getMap("m").set("votes", 3);
    created[0]!.serverClose(LIVE_CLOSE.ENDED, "ended");
    await Bun.sleep(50);
    expect(created.length).toBe(1);
    expect(state?.status).toBe("ended");
    expect(conn.doc.getMap("m").get("votes")).toBe(3);
    conn.close();
  });

  test("too old: stops and passes on the server's message", async () => {
    const { created, WS } = factory();
    const conn = connectLive(info, "p", { WS, staleMs: 0, reconnectBaseMs: 1, reconnectMaxMs: 1 });
    let state: LiveState | undefined;
    conn.onState((s) => (state = s));
    created[0]!.serverClose(LIVE_CLOSE.PROTOCOL_TOO_OLD, "update please");
    await Bun.sleep(50);
    expect(created.length).toBe(1);
    expect(state).toEqual({ status: "outdated", message: "update please" });
    conn.close();
  });
});

describe("connectLive and a hung server", () => {
  const factory = () => {
    const created: MockWS[] = [];
    const WS = function (url: string) {
      const s = new MockWS(url);
      created.push(s);
      return s;
    } as unknown as typeof WebSocket;
    return { created, WS };
  };

  test("a silent open socket is given up without waiting for its close event", async () => {
    const { created, WS } = factory();
    const conn = connectLive(info, "p", { WS, staleMs: 60, reconnectBaseMs: 10, reconnectMaxMs: 10 });
    created[0]!.open();
    created[0]!.hung = true; // the server froze: no frames, and closing never completes
    await Bun.sleep(250);
    expect(created.length).toBeGreaterThanOrEqual(2);
    conn.close();
  });

  test("a connection attempt that never opens is retried", async () => {
    const { created, WS } = factory();
    const conn = connectLive(info, "p", { WS, staleMs: 60_000, connectTimeoutMs: 60, reconnectBaseMs: 10, reconnectMaxMs: 10 });
    created[0]!.hung = true; // never opens
    await Bun.sleep(250);
    expect(created.length).toBeGreaterThanOrEqual(2);
    conn.close();
  });
});
