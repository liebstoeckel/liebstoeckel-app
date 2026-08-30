import { type PendingEvent, acknowledge, claim, nextLeaseExpiry, selectAvailable } from "./lanes";
import { type ApplyEventShape, instructionsForEvent } from "./instructions";
import { validateReply } from "./reply";
import type { RestoreResult } from "./snapshot";
import {
  ANNOTATION_KINDS,
  type AnnotationEntry,
  type AnnotationKind,
  type AnnotationStore,
  assignRequestIndices,
  entriesByStatus,
  entriesInBatch,
  rebaseRequestsAfterInsert,
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
// A batch under an agent routinely takes longer than a few minutes; a lease
// that expires under a working agent reopens Revert (whole-tree restore) on
// top of its edits, so it errs long.
// A leased batch is only ever redelivered to a *new* poll, and a single local
// agent does not poll again before it replies, so the lease mostly decides how
// soon a relaunched agent gets the batch a crashed one held. Five minutes covers
// a slow apply without stranding a batch for half an hour.
const DEFAULT_LEASE_MS = 300_000;
// After a reply the agent re-enters `dev poll` within seconds; showing "offline"
// for that gap is noise, so presence lingers this long past the last reply.
const PRESENCE_GRACE_MS = 20_000;
const SSE_HEARTBEAT_MS = 30_000;
const STOP_FLUSH_MS = 100;
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
  /** Deck-relative entry file (the one with the `slides` array), or null. */
  entryFile(): string | null;
  /** Persist a screenshot; returns the name stored on the entry. */
  writeScreenshot(id: string, bytes: Uint8Array): string;
  /** Where the agent finds a stored screenshot (absolute path locally). */
  screenshotRef(name: string): string;
  takeSnapshot(batchId: string, files: string[]): void;
  /** Once the agent has replied (done or error): seal what the batch
   *  created, the reported files plus any source that appeared since
   *  dispatch, so revert removes them and nothing added later. */
  recordCreated(batchId: string, files: string[]): void;
  /** Restore a batch snapshot; null when no snapshot exists for the id. */
  restoreSnapshot(batchId: string): RestoreResult | null;
  removeSnapshot(batchId: string): void;
  /** Ids of batches dispatched after `batchId` that still have a snapshot.
   *  Restoring a batch puts the tree back to before it, which undoes those
   *  too, so revert reopens them. Empty when the order is unknown. */
  batchesAfter(batchId: string): string[];
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
  /** How long presence outlives an agent's reply before it counts as offline. */
  presenceGraceMs?: number;
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
  const presenceGraceMs = opts.presenceGraceMs ?? PRESENCE_GRACE_MS;

  let store = backend.loadStore();
  const pending: Array<PendingEvent> = [];
  let polls: Poll[] = [];
  const sseClients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  let seq = 1;
  let leaseTimer: ReturnType<typeof setTimeout> | null = null;
  let presenceGraceUntil = 0;
  let presenceTimer: ReturnType<typeof setTimeout> | null = null;
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

  /** What the sidebar shows: a parked poll, or an agent that replied moments
   *  ago and is on its way back to one. `agentPolling()` stays the strict
   *  answer that decides whether a dispatch is delivered or staged. */
  function agentPresent(): boolean {
    return agentPolling() || Date.now() < presenceGraceUntil;
  }

  function presence(): { connected: boolean; busy: boolean } {
    return { connected: agentPresent(), busy: agentBusy() };
  }

  function extendPresenceGrace(): void {
    presenceGraceUntil = Date.now() + presenceGraceMs;
    if (presenceTimer) clearTimeout(presenceTimer);
    presenceTimer = setTimeout(() => {
      presenceTimer = null;
      broadcastAgentPollingIfChanged();
    }, presenceGraceMs + 5);
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
      const poll = polls[0]!;
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
      // Slide requests in target order: chained requests at one position must
      // be registered in sequence for their indices to hold.
      annotations: [...entries].sort((a, b) => a.slide.index - b.slide.index || a.createdAt - b.createdAt).map((entry) => ({
        id: entry.id,
        ...(entry.kind ? { kind: entry.kind } : {}),
        ...(entry.request ? { request: entry.request } : {}),
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
        agentPolling: agentPresent(),
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
              `data: ${JSON.stringify({ type: "connected", agentPolling: agentPresent(), agentBusy: agentBusy() })}\n\n`,
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
        | {
            token?: string;
            id?: string;
            slideIndex?: number;
            comments?: unknown;
            strokes?: unknown;
            space?: unknown;
            kind?: unknown;
            request?: { after?: unknown; description?: unknown };
          }
        | null;
      if (!body) return json(400, { error: "invalid_json" });
      if (!authorized(body)) return json(401, { error: "unauthorized" });
      const kind: AnnotationKind = body.kind === undefined ? "annotate" : (body.kind as AnnotationKind);
      if (!ANNOTATION_KINDS.includes(kind)) return json(400, { error: "unknown_kind" });
      if (kind === "remove-slide" || kind === "move-slide") return json(400, { error: "kind_not_implemented", kind });
      const slides = backend.resolveSlides();
      let request: AnnotationEntry["request"];
      if (kind === "add-slide") {
        const after = body.request?.after;
        const description = typeof body.request?.description === "string" ? body.request.description.trim() : "";
        if (typeof after !== "number" || !Number.isInteger(after) || after < -1) return json(400, { error: "request_after_invalid" });
        // `after` names a slide of the deck as it is now; past the last one is a typo, not a position.
        if (slides && after > slides.length - 1) return json(400, { error: "request_after_out_of_range", slides: slides.length });
        if (!description) return json(400, { error: "request_description_required" });
        request = { after, description };
        body.slideIndex = after + 1;
      }
      if (typeof body.slideIndex !== "number") return json(400, { error: "slideIndex_required" });
      if (!Number.isInteger(body.slideIndex) || body.slideIndex < 0) return json(400, { error: "slideIndex_invalid" });
      const id = typeof body.id === "string" && ID_RE.test(body.id) ? body.id : shortId();
      const now = Date.now();
      const existing = store.entries[id];
      // An entry an agent is working on keeps its batch; rewriting it would
      // detach it and make the agent's otherwise correct reply fail.
      if (existing?.status === "dispatched") return json(409, { error: "entry_dispatched", batchId: existing.batchId });
      const entry: AnnotationEntry = {
        id,
        ...(kind !== "annotate" ? { kind } : {}),
        ...(request ? { request } : {}),
        slide: { index: body.slideIndex, sourceFile: request ? null : (slides?.[body.slideIndex] ?? null) },
        comments: Array.isArray(body.comments) ? (body.comments as AnnotationEntry["comments"]) : [],
        strokes: Array.isArray(body.strokes) ? (body.strokes as AnnotationEntry["strokes"]) : [],
        ...(body.space === "stage" ? { space: "stage" as const } : {}),
        screenshot: existing?.screenshot ?? null,
        status: "open",
        batchId: null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      store = assignRequestIndices(upsertEntry(store, entry));
      save();
      const stored = store.entries[id]!;
      broadcast({ type: "annotation_updated", entry: stored });
      return json(200, { ok: true, entry: stored });
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
      // Locked while with the agent: reopening would detach it from its batch
      // (the reply then fails) and dismissing would be undone by that reply.
      const current = store.entries[body.id]!;
      if (current.status === "dispatched") return json(409, { error: "entry_dispatched", batchId: current.batchId });
      store = assignRequestIndices(setStatus(store, [body.id], body.status));
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
      // The snapshot is taken from the live tree: with an agent mid-edit it
      // would capture half-applied work as this batch's "before", and the
      // agent's own batch could no longer be reverted cleanly.
      if (agentBusy()) return json(409, { error: "agent_busy", hint: "an agent holds a batch; send again after it replies or its claim expires" });
      // A staged batch nobody has claimed yet is just as blocking: its
      // snapshot predates this one, so the agent would apply both in order and
      // reverting this batch would also wipe the staged one's edits while its
      // entries stayed "applied". One batch in flight at a time, claimed or not.
      if (pending.length > 0) {
        return json(409, { error: "batch_pending", batchId: pending[0]!.event.id, hint: "a batch is staged for the next agent; send again after it was picked up and answered" });
      }
      store = assignRequestIndices(store);
      const open = entriesByStatus(store, "open", body.slideIndex);
      if (open.length === 0) return json(400, { error: "nothing_to_dispatch" });
      const batchId = shortId();
      const files = [...new Set(open.map((e) => e.slide.sourceFile).filter(Boolean))] as string[];
      // A slide request edits the deck entry; snapshot it so revert can unregister.
      const entryFile = open.some((e) => e.kind === "add-slide") ? backend.entryFile() : null;
      if (entryFile && !files.includes(entryFile)) files.push(entryFile);
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
      // Snapshots cover the whole source tree, so a restore while an agent
      // holds a lease would silently wipe its in-progress edits (even for a
      // different batch). Refuse until the agent replies or the lease expires.
      if (agentBusy()) return json(409, { error: "agent_busy", hint: "an agent holds a batch; revert after it replies or its claim expires" });
      const result = backend.restoreSnapshot(body.batchId);
      if (!result) return json(404, { error: "unknown_batch" });
      if (result.failures.length > 0) {
        // A file that could not be written or removed (locked by an editor,
        // a permission error) leaves the tree half restored. Keep the
        // entries and the snapshot as they are so the revert can be retried
        // once the file is free; flipping them now would show the batch as
        // reverted while its edits are still on disk, and dropping the
        // snapshot would make the retry impossible.
        return json(500, { error: "revert_incomplete", hint: "some files could not be restored; fix them and revert again", ...result });
      }
      // The tree is now as it was before this batch, so every batch applied
      // after it is gone from the deck as well: reopen those too, rather than
      // leaving entries marked applied for edits that no longer exist.
      const reopenedBatches = backend.batchesAfter(body.batchId).filter((id) => id !== body.batchId);
      const batches = [body.batchId, ...reopenedBatches];
      const ids = batches.flatMap((batchId) => entriesInBatch(store, batchId).map((e) => e.id));
      store = assignRequestIndices(setStatus(store, ids, "open"));
      save();
      // The batches are undone; a still-queued apply event for them must not reach an agent.
      for (const batchId of batches) {
        acknowledge(pending, batchId);
        backend.removeSnapshot(batchId);
      }
      broadcastAgentPollingIfChanged();
      broadcast({ type: "batch_reverted", batchId: body.batchId, reopenedBatches, ...result });
      return json(200, { ok: true, reopenedBatches, ...result });
    }

    if (p === "/__dev/poll" && req.method === "GET") {
      if (!authorized()) return json(401, { error: "unauthorized" });
      // An explicit 0 is a probe (return at once); absent or junk means the maximum.
      const rawTimeout = url.searchParams.get("timeout");
      const requested = rawTimeout === null ? Number.NaN : Number(rawTimeout);
      const timeoutMs = Number.isFinite(requested) ? Math.max(0, Math.min(requested, pollTimeoutMs)) : pollTimeoutMs;
      const available = selectAvailable(pending, Date.now());
      if (available) {
        const event = withInstructions(claim(available, leaseMs, Date.now()));
        scheduleLeaseFlush();
        broadcastAgentPollingIfChanged();
        return json(200, event);
      }
      return await new Promise<Response>((resolvePromise) => {
        const unpark = () => {
          const idx = polls.indexOf(poll);
          if (idx !== -1) polls.splice(idx, 1);
          clearTimeout(poll.timer);
          req.signal.removeEventListener("abort", onAbort);
        };
        // A killed `dev poll` process must stop counting as a present agent
        // at once; otherwise Send would hand the next batch to a dead socket
        // and lease it to nobody until the lease expires.
        const onAbort = () => {
          unpark();
          broadcastAgentPollingIfChanged();
        };
        const poll: Poll = {
          resolve: (event: unknown) => {
            unpark();
            resolvePromise(json(200, event));
          },
          timer: setTimeout(() => {
            unpark();
            broadcastAgentPollingIfChanged();
            resolvePromise(json(200, withInstructions({ type: "timeout" })));
          }, timeoutMs),
        };
        req.signal.addEventListener("abort", onAbort, { once: true });
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
      const isPending = pending.some((e) => e.event.id === body.id);
      if (batchEntries.length === 0 && !isPending) {
        return json(404, { error: "unknown_reply_id", id: body.id });
      }
      // Applied entries keep their batchId (revert needs it), so a batch that
      // was already resolved still matches here. A duplicate `done` from a
      // retrying agent must not flip applied entries back to open.
      if (!isPending && !batchEntries.some((e) => e.status === "dispatched")) {
        return json(409, { error: "batch_already_resolved", id: body.id });
      }
      const validation = validateReply(body, batchEntries.map((e) => e.id));
      if (!validation.ok) return json(400, { error: validation.error, hint: validation.hint });
      acknowledge(pending, body.id);
      extendPresenceGrace();
      if (validation.kind === "done") {
        const applied = new Set(validation.data.applied);
        const backToOpen = batchEntries.filter((e) => !applied.has(e.id)).map((e) => e.id);
        store = setStatus(store, [...applied], "applied");
        // Entries the agent did not apply return to open so the user can retry.
        store = setStatus(store, backToOpen, "open");
        // Slides were inserted: requests still pending named slides of the
        // deck before those inserts, so shift their `after` past them first.
        // The `after` an applied request carries is the one the agent was
        // handed (frozen while dispatched), so the store is authoritative.
        const inserted = batchEntries
          .filter((e) => applied.has(e.id) && e.kind === "add-slide" && e.request)
          .map((e) => ({ after: e.request!.after, createdAt: e.createdAt }));
        store = assignRequestIndices(rebaseRequestsAfterInsert(store, inserted));
        save();
        backend.recordCreated(body.id, validation.data.files);
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
        // The snapshot stays: the agent may have half-applied the batch before
        // giving up, and /__dev/revert with this batch id puts the deck back.
        // Seal what it created so far so that revert removes those too.
        backend.recordCreated(body.id, []);
        broadcast({ type: "batch_failed", batchId: body.id, message: validation.message, revertable: true });
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
    for (const poll of [...polls]) poll.resolve(withInstructions({ type: "exit" }));
    polls = [];
    broadcast({ type: "exit" });
    if (leaseTimer) clearTimeout(leaseTimer);
    if (presenceTimer) clearTimeout(presenceTimer);
    // The exit responses above are only queued; tearing the host down in the
    // same tick would close those sockets before the bytes leave. Give the
    // event loop a moment to flush them first.
    setTimeout(() => backend.onStop?.(), STOP_FLUSH_MS);
  }

  return { handleDevRequest, agentPolling, agentBusy, stop };
}

// The protocol entry re-exports the pure cores a host needs beside the handler.
export { acknowledge, claim, nextLeaseExpiry, selectAvailable, type PendingEvent, type PollEvent } from "./lanes";
export { applyInstructions, bootInstructions, instructionsForEvent, type ApplyEventShape } from "./instructions";
export { validateReply, type ApplyReplyData } from "./reply";
export {
  ANNOTATION_KINDS,
  assignRequestIndices,
  emptyStore,
  entriesByStatus,
  entriesInBatch,
  parseStore,
  rebaseRequestsAfterInsert,
  serializeStore,
  setStatus,
  upsertEntry,
  type AppliedRequest,
  type AnnotationComment,
  type AnnotationEntry,
  type AnnotationKind,
  type AnnotationStatus,
  type SlideRequest,
  type AnnotationStore,
  type AnnotationStroke,
  type AnnotationTargetHint,
} from "./store";
export type { BatchRecord, BatchSnapshot, FileSnapshot, RestoreResult } from "./snapshot";
