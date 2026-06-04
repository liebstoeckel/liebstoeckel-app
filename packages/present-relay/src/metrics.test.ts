import { test, expect, describe } from "bun:test";
import { Counter, Gauge, Histogram, Registry, createRelayMetrics } from "./metrics";

describe("metrics registry", () => {
  test("counter renders type/help + accumulates by label set", () => {
    const r = new Registry();
    const c = r.register(new Counter("lst_x_total", "x"));
    c.inc({ reason: "a" });
    c.inc({ reason: "a" });
    c.inc({ reason: "b" }, 3);
    const out = r.render();
    expect(out).toContain("# TYPE lst_x_total counter");
    expect(out).toContain('lst_x_total{reason="a"} 2');
    expect(out).toContain('lst_x_total{reason="b"} 3');
  });

  test("gauge set/inc/dec; labels sorted + escaped", () => {
    const r = new Registry();
    const g = r.register(new Gauge("lst_g", "g"));
    g.set(5, { b: "2", a: "1" });
    g.inc({ a: "1", b: "2" });
    g.dec({ a: "1", b: "2" }, 2);
    expect(r.render()).toContain('lst_g{a="1",b="2"} 4'); // 5 + 1 - 2, keys sorted
    const e = r.register(new Gauge("lst_e", "e"));
    e.set(1, { v: 'a"b\\c' });
    expect(r.render()).toContain('lst_e{v="a\\"b\\\\c"} 1');
  });

  test("histogram emits cumulative buckets + sum + count", () => {
    const r = new Registry();
    const h = r.register(new Histogram("lst_h", "h", [1, 2, 5]));
    h.observe(0.5);
    h.observe(1.5);
    h.observe(8);
    const out = r.render();
    expect(out).toContain('lst_h_bucket{le="1"} 1'); // 0.5
    expect(out).toContain('lst_h_bucket{le="2"} 2'); // 0.5, 1.5
    expect(out).toContain('lst_h_bucket{le="5"} 2');
    expect(out).toContain('lst_h_bucket{le="+Inf"} 3');
    expect(out).toContain("lst_h_sum 10");
    expect(out).toContain("lst_h_count 3");
  });

  test("onCollect runs before render; empty metrics omitted", () => {
    const r = new Registry();
    const g = r.register(new Gauge("lst_live", "live"));
    const unused = r.register(new Counter("lst_unused_total", "unused"));
    let n = 0;
    r.onCollect(() => g.set(++n));
    expect(r.render()).toContain("lst_live 1");
    expect(r.render()).toContain("lst_live 2"); // collector ran again
    expect(r.render()).not.toContain("lst_unused_total"); // no samples → omitted
    void unused;
  });
});

describe("relay metric set", () => {
  test("build_info carries the version label; all names are prefixed", () => {
    const m = createRelayMetrics("abc123");
    const out = m.registry.render();
    expect(out).toContain('liebstoeckel_relay_build_info{version="abc123"} 1');
    m.sessionRejects.inc({ reason: "quota" });
    m.wsOpens.inc({ role: "audience" });
    const out2 = m.registry.render();
    expect(out2).toContain('liebstoeckel_relay_session_rejects_total{reason="quota"} 1');
    expect(out2).toContain('liebstoeckel_relay_ws_opens_total{role="audience"} 1');
  });
});
