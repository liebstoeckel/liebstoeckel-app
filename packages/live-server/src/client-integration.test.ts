import { test, expect, describe, afterEach } from "bun:test";
import { connectLive } from "@liebstoeckel/engine/live";
import { startServer, type LiveServer } from "./server";

// End-to-end: the engine client (connectLive) talking to the real live server.
describe("engine client ↔ live server", () => {
  let live: LiveServer | null = null;
  afterEach(() => {
    live?.stop();
    live = null;
  });

  test("two clients converge through the server both ways", async () => {
    live = await startServer({
      html: "<html><head></head><body></body></html>",
      hostname: "127.0.0.1",
      publicHost: "127.0.0.1",
    });
    const info = {
      ws: `ws://127.0.0.1:${live.port}/sync?t=${live.session.viewerToken}`,
      session: live.session.id,
      role: "viewer" as const,
      token: live.session.viewerToken,
    };
    const a = connectLive(info, "p1");
    const b = connectLive(info, "p2");
    await Promise.all([
      new Promise<void>((r) => a.onStatus((c) => c && r())),
      new Promise<void>((r) => b.onStatus((c) => c && r())),
    ]);

    a.doc.getMap("plugin:poll").set("votes-a", 1);
    b.doc.getMap("plugin:poll").set("votes-b", 2);
    await Bun.sleep(60);

    // server has both; each client sees the other's write (CRDT merge)
    expect(live.hub.doc.getMap("plugin:poll").get("votes-a")).toBe(1);
    expect(live.hub.doc.getMap("plugin:poll").get("votes-b")).toBe(2);
    expect(a.doc.getMap("plugin:poll").get("votes-b")).toBe(2);
    expect(b.doc.getMap("plugin:poll").get("votes-a")).toBe(1);

    a.close();
    b.close();
  });
});
