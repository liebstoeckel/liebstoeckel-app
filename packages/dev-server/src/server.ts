import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { type PendingEvent, acknowledge, claim, nextLeaseExpiry, selectAvailable } from "./lanes";
import { type ApplyEventShape, bootInstructions, instructionsForEvent } from "./instructions";
import { validateReply } from "./reply";
import {
  type BatchSnapshot,
  loadBatchSnapshot,
  removeBatchSnapshot,
  restoreSnapshot,
  saveBatchSnapshot,
  snapshotFiles,
} from "./snapshot";
import { resolveSlideFiles } from "./slides";
import {
  type AnnotationEntry,
  type AnnotationStore,
  devDir,
  entriesByStatus,
  entriesInBatch,
  loadStore,
  saveStore,
  screenshotsDir,
  serverInfoPath,
  setStatus,
  upsertEntry,
} from "./store";

// The dev-mode server: serves the deck through Bun's dev pipeline (HMR, Fast
// Refresh) and adds the /__dev/* surface the drawer and the agent talk to.
// One origin for everything so the drawer needs no CORS. Security model: a
// per-boot random token required on every route except the two the loader
// needs before it can know a token (/__dev/ping, /__dev/drawer.js, which
// carries the token to the page, the reason the server binds loopback by
// default and exposing it is an explicit flag).

const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
const DEFAULT_POLL_TIMEOUT_MS = 240_000;
const DEFAULT_LEASE_MS = 600_000;
const SSE_HEARTBEAT_MS = 30_000;

export interface DevServerOptions {
  deckDir: string;
  port?: number;
  hostname?: string;
  /** Skip the Bun HTML dev pipeline and serve only /__dev/* (integration tests). */
  apiOnly?: boolean;
}

interface DevState {
  token: string;
  store: AnnotationStore;
  pending: Array<PendingEvent>;
  polls: Array<{ resolve: (event: unknown) => void; timer: ReturnType<typeof setTimeout> }>;
  sseClients: Set<ReadableStreamDefaultController<Uint8Array>>;
  seq: number;
  leaseTimer: ReturnType<typeof setTimeout> | null;
  lastAgentPolling: boolean | null;
  drawerJs: string | null;
}

export interface DevServer {
  port: number;
  token: string;
  url: string;
  stop: () => void;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export async function startDevServer(opts: DevServerOptions): Promise<DevServer> {
  const deckDir = resolve(opts.deckDir);
  const hostname = opts.hostname ?? "127.0.0.1";
  const state: DevState = {
    token: randomUUID(),
    store: loadStore(deckDir),
    pending: [],
    polls: [],
    sseClients: new Set(),
    seq: 1,
    leaseTimer: null,
    lastAgentPolling: null,
    drawerJs: null,
  };

  // A restart requeues in-flight work: entries the previous server dispatched
  // but never resolved become pending apply events again, grouped by batch.
  requeueDispatched(state, deckDir);

  const save = () => saveStore(deckDir, state.store);

  function broadcast(msg: Record<string, unknown>): void {
    const data = new TextEncoder().encode(`data: ${JSON.stringify(msg)}\n\n`);
    for (const client of state.sseClients) {
      try {
        client.enqueue(data);
      } catch {
        state.sseClients.delete(client);
      }
    }
  }

  function agentPolling(): boolean {
    // A parked poll, not a leased event: a leased event only proves a poll
    // returned once; only an actively waiting poll means the drawer's Send
    // reaches an agent right now.
    return state.polls.length > 0;
  }

  function broadcastAgentPollingIfChanged(): void {
    const connected = agentPolling();
    if (state.lastAgentPolling === connected) return;
    state.lastAgentPolling = connected;
    broadcast({ type: "agent_polling", connected });
  }

  function scheduleLeaseFlush(): void {
    if (state.leaseTimer) {
      clearTimeout(state.leaseTimer);
      state.leaseTimer = null;
    }
    const next = nextLeaseExpiry(state.pending, Date.now());
    if (next === null) return;
    state.leaseTimer = setTimeout(() => {
      state.leaseTimer = null;
      flushPolls();
    }, Math.max(0, next - Date.now() + 5));
  }

  function flushPolls(): void {
    while (state.polls.length > 0) {
      const entry = selectAvailable(state.pending, Date.now());
      if (!entry) break;
      const poll = state.polls.shift()!;
      clearTimeout(poll.timer);
      poll.resolve(withInstructions(claim(entry, DEFAULT_LEASE_MS, Date.now())));
    }
    scheduleLeaseFlush();
    broadcastAgentPollingIfChanged();
  }

  function withInstructions(event: Record<string, unknown>): Record<string, unknown> {
    const _instructions = instructionsForEvent(event as { type: string });
    return _instructions ? { ...event, _instructions } : event;
  }

  function enqueue(event: PendingEvent["event"]): void {
    if (state.pending.some((entry) => entry.event.id === event.id)) return;
    state.pending.push({ event, leaseUntil: 0, seq: state.seq++ });
    flushPolls();
  }

  function buildApplyEvent(batchId: string, entries: AnnotationEntry[]): ApplyEventShape {
    return {
      id: batchId,
      type: "apply",
      deckDir,
      annotations: entries.map((entry) => ({
        id: entry.id,
        slide: entry.slide,
        comments: entry.comments,
        strokes: entry.strokes,
        screenshotPath: entry.screenshot ? join(screenshotsDir(deckDir), entry.screenshot) : null,
      })),
    };
  }

  function requeueDispatched(st: DevState, dir: string): void {
    const dispatched = entriesByStatus(st.store, "dispatched");
    const byBatch = new Map<string, AnnotationEntry[]>();
    for (const entry of dispatched) {
      if (!entry.batchId) continue;
      const list = byBatch.get(entry.batchId) ?? [];
      list.push(entry);
      byBatch.set(entry.batchId, list);
    }
    for (const [batchId, entries] of byBatch) {
      st.pending.push({
        event: buildApplyEvent(batchId, entries) as unknown as PendingEvent["event"],
        leaseUntil: 0,
        seq: st.seq++,
      });
    }
    void dir;
  }

  function tokenOk(url: URL, body?: { token?: unknown }): boolean {
    return (body?.token ?? url.searchParams.get("token")) === state.token;
  }

  async function handleDev(req: Request, url: URL): Promise<Response | null> {
    const p = url.pathname;

    if (p === "/__dev/ping") return json(200, { ok: true });

    if (p === "/__dev/drawer.js") {
      const drawer = await drawerBundle(state);
      const prelude =
        `window.__LIEBSTOECKEL_DEV__=${JSON.stringify({ token: state.token })};\n`;
      return new Response(prelude + drawer, {
        headers: { "Content-Type": "application/javascript", "Cache-Control": "no-store" },
      });
    }

    if (p === "/__dev/state") {
      if (!tokenOk(url)) return json(401, { error: "unauthorized" });
      return json(200, {
        annotations: state.store.entries,
        agentPolling: agentPolling(),
        slides: resolveSlideFiles(deckDir),
      });
    }

    if (p === "/__dev/events" && req.method === "GET") {
      if (!tokenOk(url)) return json(401, { error: "unauthorized" });
      let heartbeat: ReturnType<typeof setInterval>;
      let controllerRef: ReadableStreamDefaultController<Uint8Array>;
      const stream = new ReadableStream<Uint8Array>({
        start: (controller) => {
          controllerRef = controller;
          state.sseClients.add(controller);
          controller.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({ type: "connected", agentPolling: agentPolling() })}\n\n`,
            ),
          );
          heartbeat = setInterval(() => {
            try {
              controller.enqueue(new TextEncoder().encode(": keepalive\n\n"));
            } catch {
              clearInterval(heartbeat);
            }
          }, SSE_HEARTBEAT_MS);
        },
        cancel: () => {
          clearInterval(heartbeat);
          state.sseClients.delete(controllerRef);
        },
      });
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
      });
    }

    if (p === "/__dev/annotations" && req.method === "POST") {
      const body = (await req.json().catch(() => null)) as
        | { token?: string; id?: string; slideIndex?: number; comments?: unknown; strokes?: unknown }
        | null;
      if (!body) return json(400, { error: "invalid_json" });
      if (!tokenOk(url, body)) return json(401, { error: "unauthorized" });
      if (typeof body.slideIndex !== "number") return json(400, { error: "slideIndex_required" });
      const id = typeof body.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(body.id)
        ? body.id
        : randomUUID().replace(/-/g, "").slice(0, 8);
      const slides = resolveSlideFiles(deckDir);
      const now = Date.now();
      const existing = state.store.entries[id];
      const entry: AnnotationEntry = {
        id,
        slide: { index: body.slideIndex, sourceFile: slides?.[body.slideIndex] ?? null },
        comments: Array.isArray(body.comments) ? (body.comments as AnnotationEntry["comments"]) : [],
        strokes: Array.isArray(body.strokes) ? (body.strokes as AnnotationEntry["strokes"]) : [],
        screenshot: existing?.screenshot ?? null,
        status: "open",
        batchId: null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      state.store = upsertEntry(state.store, entry);
      save();
      broadcast({ type: "annotation_updated", entry });
      return json(200, { ok: true, entry });
    }

    if (p === "/__dev/annotation-status" && req.method === "POST") {
      const body = (await req.json().catch(() => null)) as
        | { token?: string; id?: string; status?: string }
        | null;
      if (!body) return json(400, { error: "invalid_json" });
      if (!tokenOk(url, body)) return json(401, { error: "unauthorized" });
      if (typeof body.id !== "string" || !state.store.entries[body.id]) return json(404, { error: "unknown_annotation" });
      // The drawer only dismisses or reopens; dispatch/applied are server-driven.
      if (body.status !== "dismissed" && body.status !== "open") return json(400, { error: "invalid_status" });
      state.store = setStatus(state.store, [body.id], body.status);
      save();
      broadcast({ type: "annotation_updated", entry: state.store.entries[body.id] });
      return json(200, { ok: true });
    }

    if (p === "/__dev/screenshot" && req.method === "POST") {
      if (!tokenOk(url)) return json(401, { error: "unauthorized" });
      const id = url.searchParams.get("id") ?? "";
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || !state.store.entries[id]) return json(400, { error: "unknown_annotation" });
      if ((req.headers.get("content-type") ?? "").toLowerCase() !== "image/png") {
        return json(415, { error: "content_type_must_be_png" });
      }
      const bytes = new Uint8Array(await req.arrayBuffer());
      if (bytes.byteLength > MAX_SCREENSHOT_BYTES) return json(413, { error: "payload_too_large" });
      const dir = screenshotsDir(deckDir);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${id}.png`), bytes);
      state.store = upsertEntry(state.store, { ...state.store.entries[id]!, screenshot: `${id}.png`, updatedAt: Date.now() });
      save();
      return json(200, { ok: true });
    }

    if (p === "/__dev/dispatch" && req.method === "POST") {
      const body = (await req.json().catch(() => null)) as
        | { token?: string; slideIndex?: number }
        | null;
      if (!body) return json(400, { error: "invalid_json" });
      if (!tokenOk(url, body)) return json(401, { error: "unauthorized" });
      const open = entriesByStatus(state.store, "open", body.slideIndex);
      if (open.length === 0) return json(400, { error: "nothing_to_dispatch" });
      const batchId = randomUUID().replace(/-/g, "").slice(0, 8);
      const files = [...new Set(open.map((e) => e.slide.sourceFile).filter(Boolean))] as string[];
      saveBatchSnapshot(deckDir, batchId, snapshotFiles(deckDir, files));
      state.store = setStatus(state.store, open.map((e) => e.id), "dispatched", { batchId });
      save();
      // Read presence BEFORE enqueue: delivering to a parked poll consumes it,
      // so reading after would report "no agent" for a batch that was in fact
      // handed to one that instant.
      const delivered = agentPolling();
      enqueue(buildApplyEvent(batchId, entriesInBatch(state.store, batchId)) as unknown as PendingEvent["event"]);
      broadcast({ type: "batch_dispatched", batchId, entryIds: open.map((e) => e.id), agentPolling: delivered });
      return json(200, { ok: true, batchId, agentPolling: delivered });
    }

    if (p === "/__dev/revert" && req.method === "POST") {
      const body = (await req.json().catch(() => null)) as
        | { token?: string; batchId?: string }
        | null;
      if (!body) return json(400, { error: "invalid_json" });
      if (!tokenOk(url, body)) return json(401, { error: "unauthorized" });
      if (typeof body.batchId !== "string") return json(400, { error: "batchId_required" });
      const snapshot = loadBatchSnapshot(deckDir, body.batchId);
      if (!snapshot) return json(404, { error: "unknown_batch" });
      const result = restoreSnapshot(deckDir, snapshot);
      const ids = entriesInBatch(state.store, body.batchId).map((e) => e.id);
      state.store = setStatus(state.store, ids, "open");
      save();
      // The batch is undone; a still-queued apply event for it must not reach an agent.
      acknowledge(state.pending, body.batchId);
      removeBatchSnapshot(deckDir, body.batchId);
      broadcast({ type: "batch_reverted", batchId: body.batchId, ...result });
      return json(200, { ok: true, ...result });
    }

    if (p === "/__dev/poll" && req.method === "GET") {
      if (!tokenOk(url)) return json(401, { error: "unauthorized" });
      const timeoutMs = Math.min(
        Number(url.searchParams.get("timeout") ?? DEFAULT_POLL_TIMEOUT_MS) || DEFAULT_POLL_TIMEOUT_MS,
        DEFAULT_POLL_TIMEOUT_MS,
      );
      const available = selectAvailable(state.pending, Date.now());
      if (available) {
        const event = withInstructions(claim(available, DEFAULT_LEASE_MS, Date.now()));
        scheduleLeaseFlush();
        return json(200, event);
      }
      return await new Promise<Response>((resolvePromise) => {
        const poll = {
          resolve: (event: unknown) => resolvePromise(json(200, event)),
          timer: setTimeout(() => {
            const idx = state.polls.indexOf(poll);
            if (idx !== -1) state.polls.splice(idx, 1);
            broadcastAgentPollingIfChanged();
            resolvePromise(json(200, withInstructions({ type: "timeout" })));
          }, timeoutMs),
        };
        state.polls.push(poll);
        broadcastAgentPollingIfChanged();
      });
    }

    if (p === "/__dev/poll" && req.method === "POST") {
      const body = (await req.json().catch(() => null)) as
        | { token?: string; id?: string; type?: string; data?: unknown; message?: string }
        | null;
      if (!body) return json(400, { error: "invalid_json" });
      if (!tokenOk(url, body)) return json(401, { error: "unauthorized" });
      if (typeof body.id !== "string") return json(400, { error: "missing_reply_id" });
      const batchEntries = entriesInBatch(state.store, body.id);
      if (batchEntries.length === 0 && !state.pending.some((e) => e.event.id === body.id)) {
        return json(404, { error: "unknown_reply_id", id: body.id });
      }
      const validation = validateReply(body, batchEntries.map((e) => e.id));
      if (!validation.ok) return json(400, { error: validation.error, hint: validation.hint });
      acknowledge(state.pending, body.id);
      if (validation.kind === "done") {
        const applied = new Set(validation.data.applied);
        const backToOpen = batchEntries.filter((e) => !applied.has(e.id)).map((e) => e.id);
        state.store = setStatus(state.store, [...applied], "applied");
        // Entries the agent did not apply return to open so the user can retry.
        state.store = setStatus(state.store, backToOpen, "open");
        save();
        broadcast({
          type: "batch_resolved",
          batchId: body.id,
          applied: validation.data.applied,
          reopened: backToOpen,
          files: validation.data.files,
          notes: validation.data.notes,
        });
      } else {
        const ids = batchEntries.map((e) => e.id);
        state.store = setStatus(state.store, ids, "open");
        save();
        removeBatchSnapshot(deckDir, body.id);
        broadcast({ type: "batch_failed", batchId: body.id, message: validation.message });
      }
      flushPolls();
      return json(200, { ok: true });
    }

    if (p === "/__dev/stop") {
      if (!tokenOk(url)) return json(401, { error: "unauthorized" });
      queueMicrotask(() => stop());
      return json(200, { ok: true, stopping: true });
    }

    return null;
  }

  // The deck itself rides Bun's dev pipeline via a dynamic HTML import, which
  // gives HMR + Fast Refresh exactly as a hand-written server.ts would.
  const routes: Record<string, unknown> = {};
  if (!opts.apiOnly) {
    const indexPath = join(deckDir, "index.html");
    if (!existsSync(indexPath)) throw new Error(`No index.html in ${deckDir}`);
    const mod = await import(indexPath);
    routes["/"] = mod.default;
  }

  const server = Bun.serve({
    port: opts.port ?? 0,
    hostname,
    // Bun closes idle connections after 10s by default, which kills a parked
    // long-poll and starves SSE between heartbeats. 255 is Bun's maximum; the
    // poll timeout (240s) stays below it so the server always answers first.
    idleTimeout: 255,
    development: { hmr: true, console: true },
    ...(Object.keys(routes).length > 0 ? { routes: routes as never } : {}),
    fetch: async (req) => {
      const url = new URL(req.url);
      const handled = await handleDev(req, url);
      if (handled) return handled;
      return new Response("Not found", { status: 404 });
    },
  });

  const info = { port: server.port, token: state.token, pid: process.pid, startedAt: new Date().toISOString() };
  mkdirSync(devDir(deckDir), { recursive: true });
  writeFileSync(serverInfoPath(deckDir), JSON.stringify(info, null, 2) + "\n", "utf-8");
  ensureDevGitignore(deckDir);

  function stop(): void {
    for (const poll of state.polls) {
      clearTimeout(poll.timer);
      poll.resolve(withInstructions({ type: "exit" }));
    }
    state.polls = [];
    broadcast({ type: "exit" });
    if (state.leaseTimer) clearTimeout(state.leaseTimer);
    try {
      rmSync(serverInfoPath(deckDir));
    } catch {
      // already gone
    }
    server.stop(true);
  }

  return {
    port: server.port!,
    token: state.token,
    url: `http://${hostname === "0.0.0.0" ? "localhost" : hostname}:${server.port}`,
    stop,
  };
}

/** Keep `.liebstoeckel/dev/` out of the deck's git history: server.json holds
 *  the session token and screenshots/snapshots are working state. */
function ensureDevGitignore(deckDir: string): void {
  const file = join(devDir(deckDir), ".gitignore");
  try {
    mkdirSync(dirname(file), { recursive: true });
    if (!existsSync(file)) writeFileSync(file, "server.json\nscreenshots/\nsnapshots/\n", "utf-8");
  } catch {
    // best-effort
  }
}

/** Build (and memoize) the drawer bundle from the sibling drawer/ sources. */
async function drawerBundle(state: { drawerJs: string | null }): Promise<string> {
  if (state.drawerJs) return state.drawerJs;
  const entry = join(import.meta.dir, "..", "drawer", "drawer.ts");
  const result = await Bun.build({ entrypoints: [entry], target: "browser", minify: false });
  if (!result.success) {
    const logs = result.logs.map(String).join("\n");
    throw new Error(`drawer bundle failed:\n${logs}`);
  }
  state.drawerJs = await result.outputs[0]!.text();
  return state.drawerJs;
}

export function readServerInfo(deckDir: string): { port: number; token: string } | null {
  const file = serverInfoPath(deckDir);
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf-8"));
    if (typeof raw?.port === "number" && typeof raw?.token === "string") return { port: raw.port, token: raw.token };
  } catch {
    // fall through
  }
  return null;
}

export { bootInstructions };
