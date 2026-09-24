import { afterEach, describe, expect, test } from "bun:test";
import { SyncClient, type SyncStatus } from "./client.ts";
import { CLOSE, MSG_READY, SYNC_PROTOCOL, encodeFrame } from "./wire.ts";

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
