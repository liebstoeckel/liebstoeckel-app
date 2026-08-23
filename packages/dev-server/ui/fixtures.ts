import type { AnnotationEntry, DevTransport } from "../drawer/bridge";
import type { FrameBridge, FrameEvents, OverlayMode, SlideInfo } from "./types";

// In-memory stand-ins for the transport and the frame bridge, so the sidebar
// renders and behaves in stories (and tests) with no server and no deck.

export const FIXTURE_SLIDES: SlideInfo[] = [
  { index: 0, sourceFile: "slides/01-title.mdx" },
  { index: 1, sourceFile: "slides/02-agenda.mdx" },
  { index: 2, sourceFile: "slides/03-chart.tsx" },
  { index: 3, sourceFile: "slides/04-code.tsx" },
  { index: 4, sourceFile: null },
  { index: 5, sourceFile: "slides/06-closing.mdx" },
];

export function fixtureEntry(id: string, overrides: Partial<AnnotationEntry> = {}): AnnotationEntry {
  return {
    id,
    slide: { index: 0, sourceFile: "slides/01-title.mdx" },
    comments: [{ x: 0.4, y: 0.3, text: "make the title bolder" }],
    strokes: [{ points: [[0.1, 0.1], [0.3, 0.2]] }],
    screenshot: `${id}.png`,
    status: "open",
    batchId: null,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

export interface MemoryTransport extends DevTransport {
  /** Push a server-side event to subscribers, as SSE would. */
  emit(msg: Record<string, unknown>): void;
  entries(): Record<string, AnnotationEntry>;
  setAgentPolling(on: boolean): void;
}

export function memoryTransport(seed: AnnotationEntry[] = [], opts: { agentPolling?: boolean; latencyMs?: number } = {}): MemoryTransport {
  let entries: Record<string, AnnotationEntry> = Object.fromEntries(seed.map((e) => [e.id, e]));
  let agentPolling = opts.agentPolling ?? false;
  const listeners = new Set<(msg: Record<string, unknown>) => void>();
  const wait = () => new Promise<void>((r) => setTimeout(r, opts.latencyMs ?? 120));
  const emit = (msg: Record<string, unknown>) => listeners.forEach((l) => l(msg));
  let counter = seed.length;
  const shortId = () => `fx${(++counter).toString(36).padStart(4, "0")}`;

  return {
    emit,
    entries: () => entries,
    setAgentPolling(on) {
      agentPolling = on;
      emit({ type: "agent_polling", connected: on });
    },
    async getState() {
      await wait();
      return { annotations: entries, agentPolling };
    },
    async saveAnnotation(input) {
      await wait();
      const now = Date.now();
      const entry: AnnotationEntry = {
        id: shortId(),
        slide: { index: input.slideIndex, sourceFile: FIXTURE_SLIDES[input.slideIndex]?.sourceFile ?? null },
        comments: input.comments,
        strokes: input.strokes,
        screenshot: null,
        status: "open",
        batchId: null,
        createdAt: now,
        updatedAt: now,
      };
      entries = { ...entries, [entry.id]: entry };
      emit({ type: "annotation_updated", entry });
      return entry;
    },
    async uploadScreenshot() {
      await wait();
    },
    async setStatus(id, status) {
      await wait();
      const entry = entries[id];
      if (!entry) return;
      entries = { ...entries, [id]: { ...entry, status, updatedAt: Date.now() } };
      emit({ type: "annotation_updated", entry: entries[id] });
    },
    async dispatch() {
      await wait();
      const open = Object.values(entries).filter((e) => e.status === "open");
      if (open.length === 0) throw new Error("nothing_to_dispatch");
      const batchId = shortId();
      for (const e of open) entries = { ...entries, [e.id]: { ...e, status: "dispatched", batchId, updatedAt: Date.now() } };
      emit({ type: "batch_dispatched", batchId, entryIds: open.map((e) => e.id), agentPolling });
      if (agentPolling) {
        // Scripted agent: takes the batch (busy), applies it after a beat, polls again.
        emit({ type: "agent_polling", connected: false, busy: true });
        setTimeout(() => {
          for (const e of open) entries = { ...entries, [e.id]: { ...entries[e.id]!, status: "applied", updatedAt: Date.now() } };
          emit({ type: "batch_resolved", batchId, applied: open.map((e) => e.id), reopened: [], files: ["slides/01-title.mdx"], notes: ["made the title bolder"] });
          emit({ type: "agent_polling", connected: true, busy: false });
        }, 1400);
      }
      return { batchId, agentPolling };
    },
    async revert(batchId) {
      await wait();
      for (const e of Object.values(entries)) {
        if (e.batchId === batchId) entries = { ...entries, [e.id]: { ...e, status: "open", batchId: null, updatedAt: Date.now() } };
      }
      emit({ type: "batch_reverted", batchId, restored: ["slides/01-title.mdx"], failures: [] });
    },
    subscribe(onMessage) {
      listeners.add(onMessage);
      queueMicrotask(() => onMessage({ type: "connected", agentPolling }));
      return () => listeners.delete(onMessage);
    },
  };
}

export interface MemoryFrame {
  bridge: FrameBridge;
  onFrame: (listener: (event: Partial<FrameEvents>) => void) => () => void;
  /** Simulate the frame: the user changed slide / drew something. */
  setSlide(index: number): void;
  addStroke(): void;
  addComment(text: string): void;
  mode(): OverlayMode;
}

export function memoryFrame(transport: DevTransport, initialSlide = 0): MemoryFrame {
  const listeners = new Set<(event: Partial<FrameEvents>) => void>();
  const send = (event: Partial<FrameEvents>) => listeners.forEach((l) => l(event));
  let slide = initialSlide;
  let mode: OverlayMode = "off";
  let draft: FrameEvents["draft"] = { strokes: [], comments: [] };
  const pushDraft = () => send({ draft });
  return {
    bridge: {
      setMode(next) {
        mode = next;
        send({ mode });
      },
      async saveDraft() {
        if (!draft.strokes.length && !draft.comments.length) return null;
        const entry = await transport.saveAnnotation({ slideIndex: slide, comments: draft.comments, strokes: draft.strokes });
        draft = { strokes: [], comments: [] };
        mode = "off";
        send({ draft, mode });
        return entry.id;
      },
      clearDraft() {
        draft = { strokes: [], comments: [] };
        pushDraft();
      },
      goto(index) {
        slide = index;
        send({ slide });
      },
    },
    onFrame(listener) {
      listeners.add(listener);
      queueMicrotask(() => listener({ slide, mode, draft }));
      return () => listeners.delete(listener);
    },
    setSlide(index) {
      slide = index;
      send({ slide });
    },
    addStroke() {
      draft = { ...draft, strokes: [...draft.strokes, { points: [[0.2, 0.2], [0.5, 0.5]] }] };
      pushDraft();
    },
    addComment(text) {
      draft = { ...draft, comments: [...draft.comments, { x: 0.5, y: 0.5, text }] };
      pushDraft();
    },
    mode: () => mode,
  };
}
