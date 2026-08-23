// The in-frame bridge, loaded by the permanent loader tag when a dev server
// answers /__dev/ping. It does nothing unless the deck is framed by the dev
// shell: then it greets the parent, waits for init, and from there owns the
// overlay over the stage (strokes, comments, the element hint, the annotated
// screenshot) and the slide sync, speaking the frame protocol over
// postMessage. No chrome, no wire: the sidebar lives in the parent and owns
// the transport. This file has no exports on purpose: the bundle loads as a
// classic script.

import {
  type CommentDraft,
  type Point,
  type StrokeDraft,
  captureAnnotated,
  drawAnnotations,
  elementHintAt,
  onStage,
  stageRect,
  toStage,
  watchCurrentSlide,
} from "./bridge";
import {
  type DraftPayload,
  type FrameMessage,
  type OverlayMode,
  acceptInit,
  decodeHostMessage,
  initialHandshake,
  trusts,
} from "../src/frame-protocol";

const HOST_ID = "lst-dev-host";

const CSS = `
  :host { all: initial; }
  .overlay { position: fixed; z-index: 2147482000; cursor: crosshair; display: none; touch-action: none; }
  .overlay[data-on="true"] { display: block; }
  .cbox { position: fixed; z-index: 2147483100; background: #10140e; border: 1px solid #c9a24b; border-radius: 8px; padding: 6px; display: none; }
  .cbox input { background: transparent; color: #e9e6d7; border: 1px solid #2c3326; border-radius: 6px; padding: 5px 8px;
    font: 13px system-ui, sans-serif; width: 240px; outline: none; }
  .cbox input:focus-visible { outline: 2px solid #c9a24b; outline-offset: 1px; }
`;

function boot(): void {
  if (window.parent === window || document.getElementById(HOST_ID)) return;
  const parent = window.parent;
  let handshake = initialHandshake();
  const post = (msg: FrameMessage, targetOrigin = handshake.origin ?? "*") => parent.postMessage(msg, targetOrigin);

  // Draft state in stage fractions.
  let strokes: StrokeDraft[] = [];
  let comments: CommentDraft[] = [];
  let mode: OverlayMode = "off";
  let mounted = false;

  const draft = (): DraftPayload => ({ strokes, comments, space: "stage" });
  const emitDraft = () => post({ type: "lst:draft", draft: draft() });

  // Slide sync, reported to the parent as it changes.
  const currentSlide = watchCurrentSlide((index) => post({ type: "lst:slide", index }));
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel("liebstoeckel");
  } catch {
    // no channel: goto is a no-op
  }

  // ---------------------------------------------------------------- overlay

  let host: HTMLDivElement;
  let overlay: HTMLCanvasElement;
  let octx: CanvasRenderingContext2D;
  let cbox: HTMLDivElement;
  let cinput: HTMLInputElement;
  let rect: DOMRect | null = null;

  function mount(): void {
    if (mounted) return;
    mounted = true;
    host = document.createElement("div");
    host.id = HOST_ID;
    document.documentElement.appendChild(host);
    const root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    root.appendChild(style);
    overlay = document.createElement("canvas");
    overlay.className = "overlay";
    root.appendChild(overlay);
    octx = overlay.getContext("2d")!;
    cbox = document.createElement("div");
    cbox.className = "cbox";
    cinput = document.createElement("input");
    cinput.placeholder = "Comment, Enter to add, Esc to cancel";
    cbox.appendChild(cinput);
    root.appendChild(cbox);

    // The overlay tracks the fitted stage box, not the window.
    const fit = () => {
      rect = stageRect();
      if (!rect) return;
      overlay.style.left = `${rect.left}px`;
      overlay.style.top = `${rect.top}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
      overlay.width = Math.round(rect.width * devicePixelRatio);
      overlay.height = Math.round(rect.height * devicePixelRatio);
      redraw();
    };
    window.addEventListener("resize", fit);
    const stage = document.querySelector("[data-deck-root]");
    if (stage && "ResizeObserver" in window) new ResizeObserver(fit).observe(stage);
    // The stage mounts after React hydrates; poll briefly until it exists.
    let tries = 0;
    const untilStage = setInterval(() => {
      fit();
      if (rect || ++tries > 50) clearInterval(untilStage);
    }, 100);

    let active: Point[] | null = null;
    overlay.addEventListener("pointerdown", (event) => {
      if (!rect) return;
      const p = toStage(event.clientX, event.clientY, rect);
      if (!onStage(p)) return;
      if (mode === "draw") {
        active = [p];
        strokes = [...strokes, { points: active }];
        overlay.setPointerCapture(event.pointerId);
      } else if (mode === "comment") {
        openCommentBox(event.clientX, event.clientY, p);
      }
    });
    overlay.addEventListener("pointermove", (event) => {
      if (!active || !rect) return;
      active.push(toStage(event.clientX, event.clientY, rect));
      redraw();
    });
    overlay.addEventListener("pointerup", () => {
      if (active) emitDraft();
      active = null;
    });

    let pending: Point | null = null;
    function openCommentBox(clientX: number, clientY: number, p: Point): void {
      pending = p;
      cbox.style.left = `${Math.min(clientX, window.innerWidth - 270)}px`;
      cbox.style.top = `${Math.min(clientY + 8, window.innerHeight - 48)}px`;
      cbox.style.display = "block";
      cinput.value = "";
      cinput.focus();
    }
    cinput.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Escape") {
        cbox.style.display = "none";
        pending = null;
      }
      if (event.key === "Enter" && cinput.value.trim() && pending && rect) {
        comments = [...comments, { x: pending[0], y: pending[1], text: cinput.value.trim(), target: elementHintAt(pending[0], pending[1], rect, overlay) }];
        cbox.style.display = "none";
        pending = null;
        redraw();
        emitDraft();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && mode !== "off") setMode("off");
    });
  }

  function redraw(): void {
    if (!octx) return;
    octx.clearRect(0, 0, overlay.width, overlay.height);
    drawAnnotations(octx, overlay.width, overlay.height, strokes, comments);
  }

  function setMode(next: OverlayMode): void {
    mode = next;
    if (overlay) overlay.dataset.on = String(mode !== "off");
    if (mode === "off" && cbox) cbox.style.display = "none";
    post({ type: "lst:mode", mode });
  }

  function clearDraft(): void {
    strokes = [];
    comments = [];
    redraw();
    emitDraft();
  }

  async function capture(id: string): Promise<void> {
    const snapshot = draft();
    let screenshot: Blob | null = null;
    if (snapshot.strokes.length || snapshot.comments.length) {
      try {
        screenshot = await captureAnnotated(snapshot.strokes, snapshot.comments, { excludeId: HOST_ID, rect });
      } catch {
        // the screenshot is a hint, never a blocker
      }
    }
    post({ type: "lst:captured", id, draft: snapshot, screenshot });
    // The parent owns the saved entry now; the draft is spent.
    strokes = [];
    comments = [];
    redraw();
    setMode("off");
    emitDraft();
  }

  // ---------------------------------------------------------------- messages

  window.addEventListener("message", (event) => {
    if (event.source !== parent) return;
    if (handshake.state === "waiting") {
      handshake = acceptInit(handshake, event.origin, event.data);
      if (handshake.state === "ready") {
        mount();
        post({ type: "lst:slide", index: currentSlide() });
        post({ type: "lst:mode", mode });
        emitDraft();
      }
      return;
    }
    if (!trusts(handshake, event.origin)) return;
    const msg = decodeHostMessage(event.data);
    if (!msg) return;
    switch (msg.type) {
      case "lst:setMode":
        setMode(msg.mode);
        break;
      case "lst:clearDraft":
        clearDraft();
        break;
      case "lst:goto":
        channel?.postMessage({ type: "goto", index: msg.index });
        break;
      case "lst:capture":
        void capture(msg.id);
        break;
    }
  });

  post({ type: "lst:hello" }, "*");
}

boot();
