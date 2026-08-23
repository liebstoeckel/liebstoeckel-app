import { type PendingEvent, acknowledge, claim, nextLeaseExpiry, selectAvailable } from "./lanes";
import { type ApplyEventShape, instructionsForEvent } from "./instructions";
import { validateReply } from "./reply";
import type { RestoreResult } from "./snapshot";
import {
  type AnnotationEntry,
  type AnnotationStore,
  entriesByStatus,
  entriesInBatch,
  setStatus,
  upsertEntry,
} from "./store";

// The /__dev/* protocol, independent of where it runs. Everything the drawer
// and the agent talk to (annotations, dispatch, the long-poll + lease loop,
// replies, revert, SSE) lives here as a handler over plain Request/Response;
// what differs between hosts (how the store is persisted, where screenshots
// and snapshots go, who is allowed in, how a slide index maps to a source
// file) is behind `DevBackend`. The local CLI supplies a filesystem backend;
// a hosted variant can supply its own without touching this file. Must stay
// free of `bun`, `node:*`, and CLI imports so a non-Bun host can import it.

const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
const DEFAULT_POLL_TIMEOUT_MS = 240_000;
const DEFAULT_LEASE_MS = 600_000;
const SSE_HEARTBEAT_MS = 30_000;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** What the protocol needs from its host. Internal for now: the shape follows
 *  the local backend and may move once a second backend exists. */
export interface DevBackend {
  /** Reported to the agent in apply events; the root its `files` are relative to. */
  deckDir: string;
  /** Whether this request may pass. `body` is the parsed JSON body when there is one. */
  authorize(url: URL, body?: { token?: unknown }): boolean;
  loadStore(): AnnotationStore;
  saveStore(store: AnnotationStore): void;
  /** Deck-relative slide source files in slide order (null per slide when the
   *  entry parser could not attribute it), or null when the list is unknown. */
  resolveSlides(): Array<string | null> | null;
  /** Persist a screenshot; returns the name stored on the entry. */
  writeScreenshot(id: string, bytes: Uint8Array): string;
  /** Where the agent finds a stored screenshot (absolute path locally). */
  screenshotRef(name: string): string;
  takeSnapshot(batchId: string, files: string[]): void;
  /** Restore a batch snapshot; null when no snapshot exists for the id. */
  restoreSnapshot(batchId: string): RestoreResult | null;
  removeSnapshot(batchId: string): void;
  /** Called once when the protocol stops (after polls and SSE clients were told). */
  onStop?(): void;
}

export interface DevProtocol {
  /** Handle a request; null when the path is not a /__dev route. */
  handleDevRequest(req: Request): Promise<Response | null>;
  /** Whether an agent is parked on the poll right now. */
  agentPolling(): boolean;
  /** Whether an agent holds a leased batch it has not replied to yet. */
  agentBusy(): boolean;
  stop(): void;
}

export interface DevProtocolOptions {
  pollTimeoutMs?: number;
  leaseMs?: number;
}

type Poll = { resolve: (event: unknown) => void; timer: ReturnType<typeof setTimeout> };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function shortId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

export function createDevProtocol(backend: DevBackend, opts: DevProtocolOptions = {}): DevProtocol {
  const pollTimeoutMs = opts.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
  const leaseMs = opts.leaseMs ?? DEFAULT_LEASE_MS;

  let store = backend.loadStore();
  const pending: Array<PendingEvent> = [];
  let polls: Poll[] = [];
  const sseClients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  let seq = 1;
  let leaseTimer: ReturnType<typeof setTimeout> | null = null;
  let lastAgentPolling: string | null = null;
  let stopped = false;

  const save = () => backend.saveStore(store);

  function broadcast(msg: Record<string, unknown>): void {
    const data = new TextEncoder().encode(`data: ${JSON.stringify(msg)}\n\n`);
    for (const client of sseClients) {
      try {
        client.enqueue(data);
      } catch {
        sseClients.delete(client);
      }
    }
  }

  function agentPolling(): boolean {
    // A parked poll, not a leased event: a leased event only proves a poll
    // returned once; only an actively waiting poll means the drawer's Send
    // reaches an agent right now.
    return polls.length > 0;
  }

  function agentBusy(): boolean {
    // A leased, unacknowledged event: an agent took a batch and has not replied.
    // Not "polling" (it is working, not waiting), not "offline" either.
    const now = Date.now();
    return pending.some((entry) => entry.leaseUntil > now);
  }

  function presence(): { connected: boolean; busy: boolean } {
    return { connected: agentPolling(), busy: agentBusy() };
  }

  function broadcastAgentPollingIfChanged(): void {
    const p = presence();
    const key = `${p.connected}:${p.busy}`;
    if (lastAgentPolling === key) return;
    lastAgentPolling = key;
    broadcast({ type: "agent_polling", ...p });
  }

  function scheduleLeaseFlush(): void {
    if (leaseTimer) {
      clearTimeout(leaseTimer);
      leaseTimer = null;
    }
    const next = nextLeaseExpiry(pending, Date.now());
    if (next === null) return;
    leaseTimer = setTimeout(() => {
      leaseTimer = null;
      flushPolls();
    }, Math.max(0, next - Date.now() + 5));
  }

  function flushPolls(): void {
    while (polls.length > 0) {
      const entry = selectAvailable(pending, Date.now());
      if (!entry) break;
      const poll = polls.shift()!;
      clearTimeout(poll.timer);
      poll.resolve(withInstructions(claim(entry, leaseMs, Date.now())));
    }
    scheduleLeaseFlush();
    broadcastAgentPollingIfChanged();
  }

  function withInstructions(event: Record<string, unknown>): Record<string, unknown> {
    const _instructions = instructionsForEvent(event as { type: string });
    return _instructions ? { ...event, _instructions } : event;
  }

  function enqueue(event: PendingEvent["event"]): void {
    if (pending.some((entry) => entry.event.id === event.id)) return;
    pending.push({ event, leaseUntil: 0, seq: seq++ });
    flushPolls();
  }

  function buildApplyEvent(batchId: string, entries: AnnotationEntry[]): ApplyEventShape {
    return {
      id: batchId,
      type: "apply",
      deckDir: backend.deckDir,
      annotations: entries.map((entry) => ({
        id: entry.id,
        slide: entry.slide,
        comments: entry.comments,
        strokes: entry.strokes,
        space: entry.space,
        screenshotPath: entry.screenshot ? backend.screenshotRef(entry.screenshot) : null,
      })),
    };
  }

  // A restart requeues in-flight work: entries the previous server dispatched
  // but never resolved become pending apply events again, grouped by batch.
  function requeueDispatched(): void {
    const byBatch = new Map<string, AnnotationEntry[]>();
    for (const entry of entriesByStatus(store, "dispatched")) {
      if (!entry.batchId) continue;
      const list = byBatch.get(entry.batchId) ?? [];
      list.push(entry);
      byBatch.set(entry.batchId, list);
    }
    for (const [batchId, entries] of byBatch) {
      pending.push({
        event: buildApplyEvent(batchId, entries) as unknown as PendingEvent["event"],
        leaseUntil: 0,
        seq: seq++,
      });
    }
  }
  requeueDispatched();

  async function handleDevRequest(req: Request): Promise<Response | null> {
    const url = new URL(req.url);
    const p = url.pathname;
    const authorized = (body?: { token?: unknown }) => backend.authorize(url, body);

    if (p === "/__dev/ping") return json(200, { ok: true });

    if (p === "/__dev/state") {
      if (!authorized()) return json(401, { error: "unauthorized" });
      return json(200, {
        annotations: store.entries,
        agentPolling: agentPolling(),
        agentBusy: agentBusy(),
        slides: backend.resolveSlides(),
      });
    }

    if (p === "/__dev/events" && req.method === "GET") {
      if (!authorized()) return json(401, { error: "unauthorized" });
      let heartbeat: ReturnType<typeof setInterval>;
      let controllerRef: ReadableStreamDefaultController<Uint8Array>;
      const stream = new ReadableStream<Uint8Array>({
        start: (controller) => {
          controllerRef = controller;
          sseClients.add(controller);
          controller.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({ type: "connected", agentPolling: agentPolling(), agentBusy: agentBusy() })}\n\n`,
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
          sseClients.delete(controllerRef);
        },
      });
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
      });
    }

    if (p === "/__dev/annotations" && req.method === "POST") {
      const body = (await req.json().catch(() => null)) as
        | { token?: string; id?: string; slideIndex?: number; comments?: unknown; strokes?: unknown; space?: unknown }
        | null;
      if (!body) return json(400, { error: "invalid_json" });
      if (!authorized(body)) return json(401, { error: "unauthorized" });
      if (typeof body.slideIndex !== "number") return json(400, { error: "slideIndex_required" });
      const id = typeof body.id === "string" && ID_RE.test(body.id) ? body.id : shortId();
      const slides = backend.resolveSlides();
      const now = Date.now();
      const existing = store.entries[id];
      const entry: AnnotationEntry = {
        id,
        slide: { index: body.slideIndex, sourceFile: slides?.[body.slideIndex] ?? null },
        comments: Array.isArray(body.comments) ? (body.comments as AnnotationEntry["comments"]) : [],
        strokes: Array.isArray(body.strokes) ? (body.strokes as AnnotationEntry["strokes"]) : [],
        ...(body.space === "stage" ? { space: "stage" as const } : {}),
        screenshot: existing?.screenshot ?? null,
        status: "open",
        batchId: null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      store = upsertEntry(store, entry);
      save();
      broadcast({ type: "annotation_updated", entry });
      return json(200, { ok: true, entry });
    }

    if (p === "/__dev/annotation-status" && req.method === "POST") {
      const body = (await req.json().catch(() => null)) as
        | { token?: string; id?: string; status?: string }
        | null;
      if (!body) return json(400, { error: "invalid_json" });
      if (!authorized(body)) return json(401, { error: "unauthorized" });
      if (typeof body.id !== "string" || !store.entries[body.id]) return json(404, { error: "unknown_annotation" });
      // The drawer only dismisses or reopens; dispatch/applied are server-driven.
      if (body.status !== "dismissed" && body.status !== "open") return json(400, { error: "invalid_status" });
      store = setStatus(store, [body.id], body.status);
      save();
      broadcast({ type: "annotation_updated", entry: store.entries[body.id] });
      return json(200, { ok: true });
    }

    if (p === "/__dev/screenshot" && req.method === "POST") {
      if (!authorized()) return json(401, { error: "unauthorized" });
      const id = url.searchParams.get("id") ?? "";
      if (!ID_RE.test(id) || !store.entries[id]) return json(400, { error: "unknown_annotation" });
      if ((req.headers.get("content-type") ?? "").toLowerCase() !== "image/png") {
        return json(415, { error: "content_type_must_be_png" });
      }
      const bytes = new Uint8Array(await req.arrayBuffer());
      if (bytes.byteLength > MAX_SCREENSHOT_BYTES) return json(413, { error: "payload_too_large" });
      const name = backend.writeScreenshot(id, bytes);
      store = upsertEntry(store, { ...store.entries[id]!, screenshot: name, updatedAt: Date.now() });
      save();
      return json(200, { ok: true });
    }

    if (p === "/__dev/dispatch" && req.method === "POST") {
      const body = (await req.json().catch(() => null)) as
        | { token?: string; slideIndex?: number }
        | null;
      if (!body) return json(400, { error: "invalid_json" });
      if (!authorized(body)) return json(401, { error: "unauthorized" });
      const open = entriesByStatus(store, "open", body.slideIndex);
      if (open.length === 0) return json(400, { error: "nothing_to_dispatch" });
      const batchId = shortId();
      const files = [...new Set(open.map((e) => e.slide.sourceFile).filter(Boolean))] as string[];
      backend.takeSnapshot(batchId, files);
      store = setStatus(store, open.map((e) => e.id), "dispatched", { batchId });
      save();
      // Read presence BEFORE enqueue: delivering to a parked poll consumes it,
      // so reading after would report "no agent" for a batch that was in fact
      // handed to one that instant.
      const delivered = agentPolling();
      enqueue(buildApplyEvent(batchId, entriesInBatch(store, batchId)) as unknown as PendingEvent["event"]);
      broadcast({ type: "batch_dispatched", batchId, entryIds: open.map((e) => e.id), agentPolling: delivered });
      return json(200, { ok: true, batchId, agentPolling: delivered });
    }

    if (p === "/__dev/revert" && req.method === "POST") {
      const body = (await req.json().catch(() => null)) as
        | { token?: string; batchId?: string }
        | null;
      if (!body) return json(400, { error: "invalid_json" });
      if (!authorized(body)) return json(401, { error: "unauthorized" });
      if (typeof body.batchId !== "string") return json(400, { error: "batchId_required" });
      const result = backend.restoreSnapshot(body.batchId);
      if (!result) return json(404, { error: "unknown_batch" });
      const ids = entriesInBatch(store, body.batchId).map((e) => e.id);
      store = setStatus(store, ids, "open");
      save();
      // The batch is undone; a still-queued apply event for it must not reach an agent.
      acknowledge(pending, body.batchId);
      backend.removeSnapshot(body.batchId);
      broadcastAgentPollingIfChanged();
      broadcast({ type: "batch_reverted", batchId: body.batchId, ...result });
      return json(200, { ok: true, ...result });
    }

    if (p === "/__dev/poll" && req.method === "GET") {
      if (!authorized()) return json(401, { error: "unauthorized" });
      const timeoutMs = Math.min(
        Number(url.searchParams.get("timeout") ?? pollTimeoutMs) || pollTimeoutMs,
        pollTimeoutMs,
      );
      const available = selectAvailable(pending, Date.now());
      if (available) {
        const event = withInstructions(claim(available, leaseMs, Date.now()));
        scheduleLeaseFlush();
        broadcastAgentPollingIfChanged();
        return json(200, event);
      }
      return await new Promise<Response>((resolvePromise) => {
        const poll: Poll = {
          resolve: (event: unknown) => resolvePromise(json(200, event)),
          timer: setTimeout(() => {
            const idx = polls.indexOf(poll);
            if (idx !== -1) polls.splice(idx, 1);
            broadcastAgentPollingIfChanged();
            resolvePromise(json(200, withInstructions({ type: "timeout" })));
          }, timeoutMs),
        };
        polls.push(poll);
        broadcastAgentPollingIfChanged();
      });
    }

    if (p === "/__dev/poll" && req.method === "POST") {
      const body = (await req.json().catch(() => null)) as
        | { token?: string; id?: string; type?: string; data?: unknown; message?: string }
        | null;
      if (!body) return json(400, { error: "invalid_json" });
      if (!authorized(body)) return json(401, { error: "unauthorized" });
      if (typeof body.id !== "string") return json(400, { error: "missing_reply_id" });
      const batchEntries = entriesInBatch(store, body.id);
      if (batchEntries.length === 0 && !pending.some((e) => e.event.id === body.id)) {
        return json(404, { error: "unknown_reply_id", id: body.id });
      }
      const validation = validateReply(body, batchEntries.map((e) => e.id));
      if (!validation.ok) return json(400, { error: validation.error, hint: validation.hint });
      acknowledge(pending, body.id);
      if (validation.kind === "done") {
        const applied = new Set(validation.data.applied);
        const backToOpen = batchEntries.filter((e) => !applied.has(e.id)).map((e) => e.id);
        store = setStatus(store, [...applied], "applied");
        // Entries the agent did not apply return to open so the user can retry.
        store = setStatus(store, backToOpen, "open");
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
        store = setStatus(store, batchEntries.map((e) => e.id), "open");
        save();
        backend.removeSnapshot(body.id);
        broadcast({ type: "batch_failed", batchId: body.id, message: validation.message });
      }
      flushPolls();
      return json(200, { ok: true });
    }

    if (p === "/__dev/stop") {
      if (!authorized()) return json(401, { error: "unauthorized" });
      queueMicrotask(() => stop());
      return json(200, { ok: true, stopping: true });
    }

    return null;
  }

  function stop(): void {
    if (stopped) return;
    stopped = true;
    for (const poll of polls) {
      clearTimeout(poll.timer);
      poll.resolve(withInstructions({ type: "exit" }));
    }
    polls = [];
    broadcast({ type: "exit" });
    if (leaseTimer) clearTimeout(leaseTimer);
    backend.onStop?.();
  }

  return { handleDevRequest, agentPolling, agentBusy, stop };
}

// The protocol entry re-exports the pure cores a host needs beside the handler.
export { acknowledge, claim, nextLeaseExpiry, selectAvailable, type PendingEvent, type PollEvent } from "./lanes";
export { applyInstructions, bootInstructions, instructionsForEvent, type ApplyEventShape } from "./instructions";
export { validateReply, type ApplyReplyData } from "./reply";
export {
  emptyStore,
  entriesByStatus,
  entriesInBatch,
  parseStore,
  serializeStore,
  setStatus,
  upsertEntry,
  type AnnotationComment,
  type AnnotationEntry,
  type AnnotationStatus,
  type AnnotationStore,
  type AnnotationStroke,
  type AnnotationTargetHint,
} from "./store";
export type { BatchSnapshot, FileSnapshot, RestoreResult } from "./snapshot";
