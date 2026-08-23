import type { DevTransport } from "../drawer/bridge";
import { type FrameMessage, type HostMessage, decodeFrameMessage } from "../src/frame-protocol";
import type { FrameBridge, FrameEvents } from "./types";

// The parent-document half of the frame bridge: turns FrameBridge calls into
// postMessage to the deck iframe and frame messages into FrameEvents for the
// sidebar. It owns the transport: a saved draft is captured in the frame,
// handed here, and written through the transport, so the frame never needs a
// token or a network. Locally the frame is same-origin; hosted it is a
// sandboxed frame with an opaque origin, in which case pass `frameOrigin:
// "null"` and the host addresses it by window with a wildcard target.

export interface FrameHostOptions {
  transport: DevTransport;
  /** Origin the frame's messages must carry; "null" for a sandboxed frame. */
  frameOrigin: string;
  currentSlide: () => number;
  captureTimeoutMs?: number;
}

export interface FrameHost {
  bridge: FrameBridge;
  onFrame: (listener: (event: Partial<FrameEvents>) => void) => () => void;
  /** True once the frame has greeted and been initialised. */
  ready(): boolean;
  destroy(): void;
}

export function createFrameHost(iframe: HTMLIFrameElement, opts: FrameHostOptions): FrameHost {
  const listeners = new Set<(event: Partial<FrameEvents>) => void>();
  const pendingCaptures = new Map<string, (msg: Extract<FrameMessage, { type: "lst:captured" }>) => void>();
  const targetOrigin = opts.frameOrigin === "null" ? "*" : opts.frameOrigin;
  let isReady = false;

  const send = (msg: HostMessage) => iframe.contentWindow?.postMessage(msg, targetOrigin);
  const emit = (event: Partial<FrameEvents>) => listeners.forEach((l) => l(event));

  function onMessage(event: MessageEvent): void {
    if (event.source !== iframe.contentWindow || event.origin !== opts.frameOrigin) return;
    const msg = decodeFrameMessage(event.data);
    if (!msg) return;
    switch (msg.type) {
      case "lst:hello":
        // A reload inside the frame greets again; re-init and reset what we knew.
        isReady = true;
        send({ type: "lst:init" });
        emit({ mode: "off", draft: { strokes: [], comments: [] } });
        break;
      case "lst:slide":
        emit({ slide: msg.index });
        break;
      case "lst:draft":
        emit({ draft: { strokes: msg.draft.strokes, comments: msg.draft.comments } });
        break;
      case "lst:mode":
        emit({ mode: msg.mode });
        break;
      case "lst:captured":
        pendingCaptures.get(msg.id)?.(msg);
        break;
    }
  }
  window.addEventListener("message", onMessage);

  const bridge: FrameBridge = {
    setMode: (mode) => send({ type: "lst:setMode", mode }),
    clearDraft: () => send({ type: "lst:clearDraft" }),
    goto: (index) => send({ type: "lst:goto", index }),
    async saveDraft() {
      // Not crypto.randomUUID: unavailable on non-secure origins (a LAN dev server over http).
      const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      const captured = await new Promise<Extract<FrameMessage, { type: "lst:captured" }> | null>((resolve) => {
        const timer = setTimeout(() => {
          pendingCaptures.delete(id);
          resolve(null);
        }, opts.captureTimeoutMs ?? 15_000);
        pendingCaptures.set(id, (msg) => {
          clearTimeout(timer);
          pendingCaptures.delete(id);
          resolve(msg);
        });
        send({ type: "lst:capture", id });
      });
      if (!captured) throw new Error("the deck frame did not answer");
      const { draft, screenshot } = captured;
      if (draft.strokes.length === 0 && draft.comments.length === 0) return null;
      const entry = await opts.transport.saveAnnotation({
        slideIndex: opts.currentSlide(),
        comments: draft.comments,
        strokes: draft.strokes,
        space: "stage",
      });
      if (screenshot) {
        try {
          await opts.transport.uploadScreenshot(entry.id, screenshot);
        } catch {
          // the screenshot is a hint, never a blocker
        }
      }
      return entry.id;
    },
  };

  return {
    bridge,
    onFrame(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ready: () => isReady,
    destroy() {
      window.removeEventListener("message", onMessage);
      listeners.clear();
    },
  };
}
