// The in-frame core of dev mode: everything that has to run inside the deck's
// own window and nothing that doesn't. Types shared with the server, the
// transport contract, the read-only slide sync off the engine's BroadcastChannel,
// stroke/comment rendering and the annotated-screenshot capture, and the tool
// registry. No drawer chrome and no wire: a hosted variant embeds a deck in a
// sandboxed iframe where the only channel out is postMessage, and this module
// is the part it reuses verbatim, with its own transport and its own UI in the
// parent frame. Keep it free of `bun`, `node:*`, and CLI imports.

import { domToPng } from "modern-screenshot";

declare global {
  interface Window {
    __LIEBSTOECKEL_DEV__?: { token: string };
  }
}

export type Point = [number, number];

export interface CommentDraft {
  x: number;
  y: number;
  text: string;
  target?: { tag?: string; classes?: string[]; text?: string };
}

export interface StrokeDraft {
  points: Point[];
}

export interface AnnotationEntry {
  id: string;
  slide: { index: number; sourceFile: string | null };
  comments: CommentDraft[];
  strokes: StrokeDraft[];
  /** "stage": fractions of the fitted slide box. Absent on entries written by
   *  the v1 drawer, which measured the window. */
  space?: "stage";
  kind?: "annotate" | "add-slide" | "remove-slide" | "move-slide";
  request?: { after: number; description: string };
  screenshot: string | null;
  status: "open" | "dispatched" | "applied" | "dismissed";
  batchId: string | null;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Transport: the only place that knows the wire. The local drawer implements
// it over HTTP + SSE; a hosted variant over postMessage or the control-plane
// API. Tool code never knows which.
// ---------------------------------------------------------------------------

export interface DevTransport {
  getState(): Promise<{ annotations: Record<string, AnnotationEntry>; agentPolling: boolean; agentBusy?: boolean; slides?: Array<string | null> | null }>;
  saveAnnotation(input: {
    slideIndex: number;
    comments: CommentDraft[];
    strokes: StrokeDraft[];
    space?: "stage";
    /** Slide requests: `kind: "add-slide"` with `request`; omit for marks. */
    kind?: "add-slide";
    request?: { after: number; description: string };
  }): Promise<AnnotationEntry>;
  uploadScreenshot(id: string, png: Blob): Promise<void>;
  setStatus(id: string, status: "dismissed" | "open"): Promise<void>;
  dispatch(): Promise<{ batchId: string; agentPolling: boolean }>;
  revert(batchId: string): Promise<void>;
  /** Returns an unsubscribe. */
  subscribe(onMessage: (msg: Record<string, unknown>) => void): () => void;
}

// ---------------------------------------------------------------------------
// Tool registry. Tools mount into whatever body the host shell owns.
// ---------------------------------------------------------------------------

export interface DevToolContext {
  transport: DevTransport;
  currentSlide: () => number;
  toast: (text: string) => void;
  refresh: () => void;
}

export interface DevTool {
  id: string;
  label: string;
  mount: (body: HTMLElement, ctx: DevToolContext) => void;
}

const tools: DevTool[] = [];

export function registerDevTool(tool: DevTool): void {
  tools.push(tool);
}

export function registeredTools(): readonly DevTool[] {
  return tools;
}

// Also exposed on window (the local bundle loads as a classic script, so
// nothing is importable from it) so a host can register tools beside annotations.
(window as unknown as Record<string, unknown>).__LIEBSTOECKEL_DEV_REGISTER_TOOL__ = registerDevTool;

// ---------------------------------------------------------------------------
// Current slide, read-only, off the engine's cross-window sync channel.
// ---------------------------------------------------------------------------

/** Track the current slide index; returns a getter. `onChange` fires on every
 *  update. Without BroadcastChannel support the index stays 0. */
export function watchCurrentSlide(onChange: (index: number) => void = () => {}): () => number {
  let slideIndex = 0;
  try {
    const channel = new BroadcastChannel("liebstoeckel");
    channel.onmessage = (event) => {
      const msg = event.data as { type?: string; index?: number };
      if (msg?.type === "state" && typeof msg.index === "number") {
        slideIndex = msg.index;
        onChange(slideIndex);
      }
    };
    channel.postMessage({ type: "request" });
  } catch {
    // no channel support: annotations land on slide 0
  }
  return () => slideIndex;
}

// ---------------------------------------------------------------------------
// The stage: the engine's fitted 16:9 box. Annotations are fractions of this
// rect, so they mean the same thing beside a sidebar, in a hosted frame, or
// on a different window size.
// ---------------------------------------------------------------------------

export const STAGE_SELECTOR = "[data-deck-root]";

export function stageRect(): DOMRect | null {
  const el = document.querySelector(STAGE_SELECTOR);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? r : null;
}

/** Client coordinates -> stage fractions (may fall outside 0..1 when off-stage). */
export function toStage(clientX: number, clientY: number, rect: DOMRect): Point {
  return [(clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height];
}

export function onStage(p: Point): boolean {
  return p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1;
}

// ---------------------------------------------------------------------------
// Rendering strokes and comments (stage fractions 0..1) onto any canvas, and
// capturing the stage with them baked in.
// ---------------------------------------------------------------------------

export function drawAnnotations(
  target: CanvasRenderingContext2D,
  w: number,
  h: number,
  strokes: StrokeDraft[],
  comments: CommentDraft[],
): void {
  target.lineWidth = Math.max(2.5, w / 640);
  target.strokeStyle = "#e0403c";
  target.lineJoin = "round";
  target.lineCap = "round";
  for (const stroke of strokes) {
    target.beginPath();
    stroke.points.forEach(([x, y], i) => {
      if (i === 0) target.moveTo(x * w, y * h);
      else target.lineTo(x * w, y * h);
    });
    target.stroke();
  }
  target.font = `${Math.max(12, w / 110)}px system-ui, sans-serif`;
  for (const comment of comments) {
    const cx = comment.x * w;
    const cy = comment.y * h;
    target.fillStyle = "#d4af37";
    target.beginPath();
    target.arc(cx, cy, Math.max(5, w / 300), 0, Math.PI * 2);
    target.fill();
    const label = comment.text;
    const metrics = target.measureText(label);
    target.fillStyle = "rgba(18,18,20,.92)";
    target.fillRect(cx + 10, cy - 12, metrics.width + 12, 22);
    target.fillStyle = "#f5f2ea";
    target.fillText(label, cx + 16, cy + 4);
  }
}

/** Light snapshot of the element under a stage-relative point, a hint for the
 *  agent. `mute` is a node to ignore while sampling (the overlay). */
export function elementHintAt(x: number, y: number, rect: DOMRect, mute?: HTMLElement): CommentDraft["target"] {
  const prev = mute?.style.pointerEvents;
  if (mute) mute.style.pointerEvents = "none";
  const el = document.elementFromPoint(rect.left + x * rect.width, rect.top + y * rect.height) as HTMLElement | null;
  if (mute) mute.style.pointerEvents = prev ?? "";
  return el
    ? {
        tag: el.tagName.toLowerCase(),
        classes: [...el.classList].slice(0, 8),
        text: (el.textContent ?? "").trim().slice(0, 80),
      }
    : undefined;
}

/** Annotated screenshot: the stage's pixels with the draft composited on top,
 *  cropped to the stage rect. Captured only because annotations exist; an
 *  unannotated screenshot would anchor the agent on the current design.
 *  `excludeId` drops the host element (overlay chrome) from the capture. */
export async function captureAnnotated(
  strokes: StrokeDraft[],
  comments: CommentDraft[],
  opts: { excludeId?: string; rect?: DOMRect | null } = {},
): Promise<Blob | null> {
  const rect = opts.rect ?? stageRect();
  const scale = Math.min(1, 1600 / window.innerWidth);
  const dataUrl = await domToPng(document.body, {
    filter: (node) => !(opts.excludeId && node instanceof Element && node.id === opts.excludeId),
    scale,
  });
  const img = new Image();
  await new Promise((resolveLoad, rejectLoad) => {
    img.onload = resolveLoad;
    img.onerror = rejectLoad;
    img.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  const sx = rect ? rect.left * scale : 0;
  const sy = rect ? rect.top * scale : 0;
  const sw = rect ? rect.width * scale : img.naturalWidth;
  const sh = rect ? rect.height * scale : img.naturalHeight;
  canvas.width = Math.round(sw);
  canvas.height = Math.round(sh);
  const cctx = canvas.getContext("2d")!;
  cctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  drawAnnotations(cctx, canvas.width, canvas.height, strokes, comments);
  return await new Promise((resolveBlob) => canvas.toBlob(resolveBlob, "image/png"));
}
