import { test, expect, describe } from "bun:test";
import * as Y from "yjs";
import { connectLive } from "./connect";

// Minimal WebSocket stand-in so we can unit-test connect without a server.
class MockWS {
  OPEN = 1;
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
    this.readyState = 3;
    this.emit("close");
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
