import { afterEach, describe, expect, test } from "bun:test";
import { LeaseHolder, holderIdentity, type LossReason } from "./holder.ts";
import { type LeaseApi, kubeLeaseApi } from "./lease-api.ts";

/** A fake of the Kubernetes Lease API: resourceVersion CAS, 409 on conflict,
 *  and switches to fail or hang. */
function fakeKube() {
  const leases = new Map<string, { metadata: { name: string; resourceVersion: string }; spec: Record<string, unknown> }>();
  let rv = 100;
  const state = { mode: "ok" as "ok" | "error" | "hang", requests: 0 };
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      state.requests++;
      if (state.mode === "hang") await Bun.sleep(10_000);
      if (state.mode === "error") return new Response("boom", { status: 503 });
      if (req.headers.get("authorization") !== "Bearer t0k") return new Response("unauthorized", { status: 401 });
      const url = new URL(req.url);
      const m = url.pathname.match(/^\/apis\/coordination\.k8s\.io\/v1\/namespaces\/ns\/leases(?:\/(.+))?$/);
      if (!m) return new Response("no", { status: 404 });
      const name = m[1];
      if (req.method === "GET" && name) {
        const l = leases.get(name);
        return l ? Response.json(l) : new Response("nf", { status: 404 });
      }
      const body = (await req.json()) as { metadata: { name: string; resourceVersion?: string }; spec: Record<string, unknown> };
      if (req.method === "POST") {
        if (leases.has(body.metadata.name)) return new Response("exists", { status: 409 });
        const l = { metadata: { name: body.metadata.name, resourceVersion: String(++rv) }, spec: body.spec };
        leases.set(l.metadata.name, l);
        return Response.json(l, { status: 201 });
      }
      if (req.method === "PUT" && name) {
        const cur = leases.get(name);
        if (!cur) return new Response("nf", { status: 404 });
        if (body.metadata.resourceVersion !== cur.metadata.resourceVersion) return new Response("conflict", { status: 409 });
        const l = { metadata: { name, resourceVersion: String(++rv) }, spec: body.spec };
        leases.set(name, l);
        return Response.json(l);
      }
      return new Response("bad", { status: 400 });
    },
  });
  const api = (timeoutMs = 500): LeaseApi =>
    kubeLeaseApi({ baseUrl: `http://127.0.0.1:${server.port}`, namespace: "ns", token: () => "t0k", timeoutMs, attempts: 2 });
  return { server, api, leases, state };
}

const servers: Array<{ stop: (force?: boolean) => void }> = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.stop(true);
});

function setup() {
  const k = fakeKube();
  servers.push(k.server);
  return k;
}

/** A holder on a fake monotonic clock, recording what it reports. */
function holder(api: LeaseApi, identity: string, clock: { t: number }, names = ["shard-0"]) {
  const events: string[] = [];
  const h = new LeaseHolder({
    api,
    identity,
    names,
    durationSeconds: 15,
    renewEveryMs: 5000,
    marginMs: 3000,
    now: () => clock.t,
    onAcquired: (n, epoch) => {
      events.push(`acquired ${n} ${epoch}`);
    },
    onLost: (n, why: LossReason) => {
      events.push(`lost ${n} ${why}`);
    },
    onError: () => {},
  });
  return { h, events };
}

describe("kubeLeaseApi", () => {
  test("maps records, creates once, and conditions updates on resourceVersion", async () => {
    const { api } = setup();
    const a = api();
    expect(await a.get("l")).toBeNull();
    const created = await a.create({ name: "l", holder: "x", durationSeconds: 15, transitions: 0, acquireTime: null, renewTime: null, resourceVersion: "" });
    if (created === "conflict") throw new Error("unexpected");
    expect(created.holder).toBe("x");
    expect(await a.create({ ...created, resourceVersion: "" })).toBe("conflict");
    const updated = await a.update({ ...created, holder: "y" });
    if (updated === "conflict") throw new Error("unexpected");
    expect(await a.update({ ...created, holder: "z" })).toBe("conflict"); // stale resourceVersion
    expect((await a.get("l"))?.holder).toBe("y");
  });

  test("a hanging API fails within the timeout instead of stalling", async () => {
    const { api, state } = setup();
    state.mode = "hang";
    const started = performance.now();
    await expect(api(200).get("l")).rejects.toBeDefined();
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe("LeaseHolder", () => {
  test("a single holder creates the lease at epoch 0 and renews it", async () => {
    const { api } = setup();
    const clock = { t: 0 };
    const { h, events } = holder(api(), "a_1", clock);
    await h.tick();
    expect(events).toEqual(["acquired shard-0 0"]);
    clock.t = 5000;
    await h.tick();
    expect(h.epochOf("shard-0")).toBe(0);
    expect(events).toHaveLength(1);
  });

  test("another holder takes over only after the lease stood still for the duration, and the old one learns it", async () => {
    const { api } = setup();
    const ca = { t: 0 };
    const cb = { t: 0 };
    const a = holder(api(), "a_1", ca);
    const b = holder(api(), "b_1", cb);
    await a.h.tick();
    await b.h.tick(); // sees a's record, starts its own count
    cb.t = 14_000;
    await b.h.tick();
    expect(b.events).toEqual([]);
    cb.t = 15_000;
    await b.h.tick();
    expect(b.events).toEqual(["acquired shard-0 1"]);
    // a was hanging meanwhile; its own clock says it is past the valid window.
    ca.t = 12_000;
    expect(a.h.epochOf("shard-0")).toBeNull();
    await a.h.tick();
    expect(a.events).toEqual(["acquired shard-0 0", "lost shard-0 taken"]);
  });

  test("two holders racing for a free lease: exactly one wins", async () => {
    const { api } = setup();
    const clock = { t: 0 };
    const hs = ["a_1", "b_1", "c_1"].map((id) => holder(api(), id, clock));
    await Promise.all(hs.map((x) => x.h.tick()));
    const winners = hs.filter((x) => x.h.epochOf("shard-0") !== null);
    expect(winners).toHaveLength(1);
  });

  test("an unreachable API makes the holder give the lease up on its own clock", async () => {
    const { api, state } = setup();
    const clock = { t: 0 };
    const a = holder(api(200), "a_1", clock);
    await a.h.tick();
    state.mode = "error";
    clock.t = 5000;
    await a.h.tick();
    expect(a.h.epochOf("shard-0")).toBe(0);
    clock.t = 12_000; // 15 s duration minus 3 s margin
    await a.h.tick();
    expect(a.events).toEqual(["acquired shard-0 0", "lost shard-0 expired"]);
    expect(a.h.epochOf("shard-0")).toBeNull();
  });

  test("stop flushes, releases, and the next holder takes over at once with a new epoch", async () => {
    const { api } = setup();
    const clock = { t: 0 };
    const a = holder(api(), "a_1", clock);
    const b = holder(api(), "b_1", clock);
    await a.h.tick();
    const flushed: string[] = [];
    await a.h.stop(async (n) => {
      flushed.push(n);
    });
    expect(flushed).toEqual(["shard-0"]);
    expect(a.events).toEqual(["acquired shard-0 0", "lost shard-0 released"]);
    await b.h.tick();
    expect(b.events).toEqual(["acquired shard-0 1"]);
  });

  test("a restart under the same name gets a new epoch", async () => {
    const { api } = setup();
    const clock = { t: 0 };
    const first = holder(api(), "pod-0", clock);
    await first.h.tick();
    const second = holder(api(), "pod-0", clock); // same identity, new process
    await second.h.tick();
    expect(second.events).toEqual(["acquired shard-0 1"]);
    expect(holderIdentity("pod-0")).not.toBe(holderIdentity("pod-0"));
  });

  test("the renew interval must fit twice into the valid window", () => {
    expect(
      () => new LeaseHolder({ api: {} as LeaseApi, identity: "x", names: [], durationSeconds: 10, renewEveryMs: 5000, marginMs: 3000 }),
    ).toThrow();
  });
});
