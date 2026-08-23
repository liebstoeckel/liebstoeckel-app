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
  getState(): Promise<{ annotations: Record<string, AnnotationEntry>; agentPolling: boolean }>;
  saveAnnotation(input: { slideIndex: number; comments: CommentDraft[]; strokes: StrokeDraft[] }): Promise<AnnotationEntry>;
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
// Rendering strokes and comments (viewport-relative 0..1 coordinates) onto any
// canvas, and capturing the page with them baked in.
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

/** Light snapshot of the element under a viewport-relative point, a hint for
 *  the agent. `mute` is a node to ignore while sampling (the overlay). */
export function elementHintAt(x: number, y: number, mute?: HTMLElement): CommentDraft["target"] {
  const prev = mute?.style.pointerEvents;
  if (mute) mute.style.pointerEvents = "none";
  const el = document.elementFromPoint(x * window.innerWidth, y * window.innerHeight) as HTMLElement | null;
  if (mute) mute.style.pointerEvents = prev ?? "";
  return el
    ? {
        tag: el.tagName.toLowerCase(),
        classes: [...el.classList].slice(0, 8),
        text: (el.textContent ?? "").trim().slice(0, 80),
      }
    : undefined;
}

/** Annotated screenshot: page pixels with the draft composited on top. Captured
 *  only because annotations exist; an unannotated screenshot would anchor the
 *  agent on the current design. `excludeId` drops the host element (the drawer)
 *  from the capture. */
export async function captureAnnotated(
  strokes: StrokeDraft[],
  comments: CommentDraft[],
  opts: { excludeId?: string } = {},
): Promise<Blob | null> {
  const dataUrl = await domToPng(document.body, {
    filter: (node) => !(opts.excludeId && node instanceof Element && node.id === opts.excludeId),
    scale: Math.min(1, 1600 / window.innerWidth),
  });
  const img = new Image();
  await new Promise((resolveLoad, rejectLoad) => {
    img.onload = resolveLoad;
    img.onerror = rejectLoad;
    img.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const cctx = canvas.getContext("2d")!;
  cctx.drawImage(img, 0, 0);
  drawAnnotations(cctx, canvas.width, canvas.height, strokes, comments);
  return await new Promise((resolveBlob) => canvas.toBlob(resolveBlob, "image/png"));
}
