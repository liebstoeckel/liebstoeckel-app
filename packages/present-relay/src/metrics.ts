// Minimal Prometheus / OpenMetrics text-exposition registry + the relay's metric set
// ((internal ADR) / (internal ticket)). Pure, dependency-free, unit-testable. Intentionally NOT a shared
// package: present-relay is OSS-published, so a shared `@liebstoeckel/metrics` would force the
// five-place OSS lock-step for ~80 lines — the registry is duplicated in control-core instead.

type Labels = Record<string, string>;

const sortedKeys = (l: Labels): string[] => Object.keys(l).sort();
const labelId = (l: Labels): string => sortedKeys(l).map((k) => `${k}=${l[k]}`).join(",");
const esc = (v: string): string => v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
const fmtLabels = (l: Labels): string => {
  const ks = sortedKeys(l);
  return ks.length ? "{" + ks.map((k) => `${k}="${esc(l[k]!)}"`).join(",") + "}" : "";
};

abstract class Metric {
  constructor(
    readonly name: string,
    readonly help: string,
    readonly type: "counter" | "gauge" | "histogram",
  ) {}
  abstract rows(): string[];
}

export class Counter extends Metric {
  private v = new Map<string, { labels: Labels; n: number }>();
  constructor(name: string, help: string) {
    super(name, help, "counter");
  }
  inc(labels: Labels = {}, by = 1): void {
    const k = labelId(labels);
    const e = this.v.get(k);
    if (e) e.n += by;
    else this.v.set(k, { labels, n: by });
  }
  rows(): string[] {
    return [...this.v.values()].map((e) => `${this.name}${fmtLabels(e.labels)} ${e.n}`);
  }
}

export class Gauge extends Metric {
  private v = new Map<string, { labels: Labels; n: number }>();
  constructor(name: string, help: string) {
    super(name, help, "gauge");
  }
  set(n: number, labels: Labels = {}): void {
    this.v.set(labelId(labels), { labels, n });
  }
  inc(labels: Labels = {}, by = 1): void {
    const k = labelId(labels);
    const e = this.v.get(k);
    if (e) e.n += by;
    else this.v.set(k, { labels, n: by });
  }
  dec(labels: Labels = {}, by = 1): void {
    this.inc(labels, -by);
  }
  rows(): string[] {
    return [...this.v.values()].map((e) => `${this.name}${fmtLabels(e.labels)} ${e.n}`);
  }
}

const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export class Histogram extends Metric {
  private v = new Map<string, { labels: Labels; counts: number[]; sum: number; total: number }>();
  constructor(
    name: string,
    help: string,
    private buckets: number[] = DEFAULT_BUCKETS,
  ) {
    super(name, help, "histogram");
  }
  observe(value: number, labels: Labels = {}): void {
    const k = labelId(labels);
    let e = this.v.get(k);
    if (!e) {
      e = { labels, counts: new Array(this.buckets.length).fill(0), sum: 0, total: 0 };
      this.v.set(k, e);
    }
    e.sum += value;
    e.total++;
    for (let i = 0; i < this.buckets.length; i++) if (value <= this.buckets[i]!) e.counts[i]!++;
  }
  rows(): string[] {
    const out: string[] = [];
    for (const e of this.v.values()) {
      // `counts[i]` already holds the cumulative count of observations ≤ buckets[i]
      // (observe() increments every bucket the value falls under), so emit it directly.
      for (let i = 0; i < this.buckets.length; i++) {
        out.push(`${this.name}_bucket${fmtLabels({ ...e.labels, le: String(this.buckets[i]) })} ${e.counts[i]}`);
      }
      out.push(`${this.name}_bucket${fmtLabels({ ...e.labels, le: "+Inf" })} ${e.total}`);
      out.push(`${this.name}_sum${fmtLabels(e.labels)} ${e.sum}`);
      out.push(`${this.name}_count${fmtLabels(e.labels)} ${e.total}`);
    }
    return out;
  }
}

export class Registry {
  private metrics: Metric[] = [];
  private collectors: Array<() => void> = [];
  register<T extends Metric>(m: T): T {
    this.metrics.push(m);
    return m;
  }
  /** Refresh callbacks run at scrape time, before render — for gauges read from live state. */
  onCollect(fn: () => void): void {
    this.collectors.push(fn);
  }
  render(): string {
    for (const fn of this.collectors) fn();
    const lines: string[] = [];
    for (const m of this.metrics) {
      const rows = m.rows();
      if (rows.length === 0) continue; // omit metrics with no samples yet
      lines.push(`# HELP ${m.name} ${m.help}`, `# TYPE ${m.name} ${m.type}`, ...rows);
    }
    return lines.join("\n") + "\n";
  }
}

/** The relay's metric set ((internal ADR)). One registry per relay instance (test-friendly). */
export function createRelayMetrics(version = "unknown") {
  const r = new Registry();
  const m = {
    registry: r,
    sessions: r.register(new Gauge("liebstoeckel_relay_sessions", "Active live sessions on this pod")),
    audiencePeers: r.register(new Gauge("liebstoeckel_relay_audience_peers", "Connected audience peers on this pod")),
    deckBytes: r.register(new Gauge("liebstoeckel_relay_deck_bytes", "In-memory deck HTML bytes held on this pod")),
    cordoned: r.register(new Gauge("liebstoeckel_relay_cordoned", "1 if this pod is cordoned (draining)")),
    startedAt: r.register(new Gauge("liebstoeckel_relay_started_at_seconds", "Process start time (unix seconds)")),
    sessionCreates: r.register(new Counter("liebstoeckel_relay_session_creates_total", "Sessions provisioned")),
    sessionRejects: r.register(new Counter("liebstoeckel_relay_session_rejects_total", "Session creates rejected, by reason")),
    snapshotWrites: r.register(new Counter("liebstoeckel_relay_snapshot_writes_total", "Snapshot persist attempts")),
    snapshotFailures: r.register(new Counter("liebstoeckel_relay_snapshot_failures_total", "Snapshot persist failures")),
    snapshotSeed: r.register(new Counter("liebstoeckel_relay_snapshot_seed_total", "Snapshot re-seed on create, by result")),
    wsOpens: r.register(new Counter("liebstoeckel_relay_ws_opens_total", "WebSocket opens, by role")),
    wsCloses: r.register(new Counter("liebstoeckel_relay_ws_closes_total", "WebSocket closes, by role")),
    wsConnections: r.register(new Gauge("liebstoeckel_relay_ws_connections", "Open WebSocket connections, by role")),
    audienceCapRejects: r.register(new Counter("liebstoeckel_relay_audience_cap_rejections_total", "WS rejected: audience cap reached")),
    grantDenials: r.register(new Counter("liebstoeckel_relay_grant_denials_total", "Deck/sync requests denied (bad/expired grant)")),
    wsFrames: r.register(new Counter("liebstoeckel_relay_ws_frames_total", "Yjs WS frames, by direction")),
    wsBytes: r.register(new Counter("liebstoeckel_relay_ws_bytes_total", "Yjs WS bytes, by direction")),
    buildInfo: r.register(new Gauge("liebstoeckel_relay_build_info", "Relay build info (constant 1)")),
  };
  m.buildInfo.set(1, { version });
  return m;
}

export type RelayMetrics = ReturnType<typeof createRelayMetrics>;
