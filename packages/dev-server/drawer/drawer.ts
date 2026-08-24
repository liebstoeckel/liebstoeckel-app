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
  // The dev server serves the shell and the deck from one origin, so the only
  // parent allowed to initialise this frame, and the only one greeted before
  // the handshake, is our own origin. A hosted variant would pass its own list.
  const home = location.origin;
  const allowedOrigins: readonly string[] = [home];
  let handshake = initialHandshake();
  const post = (msg: FrameMessage, targetOrigin = handshake.origin ?? home) => parent.postMessage(msg, targetOrigin);

  // Draft state in stage fractions.
  let strokes: StrokeDraft[] = [];
  let comments: CommentDraft[] = [];
  let mode: OverlayMode = "off";
  let mounted = false;
  // The slide the draft belongs to, pinned at the first mark: arrow keys still
  // navigate the deck while annotating, so the slide visible at save time is
  // not necessarily the one the marks were made on.
  let draftSlide: number | null = null;

  const draft = (): DraftPayload => ({ strokes, comments, space: "stage", slideIndex: draftSlide });
  const emitDraft = () => post({ type: "lst:draft", draft: draft() });
  const pinDraftSlide = () => {
    draftSlide ??= currentSlide();
  };

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

  // The overlay tracks the fitted stage box, not the window. A no-op until mount.
  let fit: () => void = () => {};

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

    fit = () => {
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
    // The engine re-fits the stage on its own ResizeObserver, then commits the
    // new scale through React and Motion, so the stage rect measured in the
    // same resize tick is still the old one. Fit now for the cheap cases and
    // again on the next two frames, by which time the engine's commit has
    // landed.
    const refit = () => {
      fit();
      requestAnimationFrame(() => {
        fit();
        requestAnimationFrame(fit);
      });
    };
    window.addEventListener("resize", refit);
    // [data-deck-root] is the logical 1280x720 canvas; its box never changes,
    // it is scaled by a transform. The box that does change is the engine's
    // fitting container two levels up (and the document itself), so observe
    // those once the stage exists.
    let observed = false;
    const observeStage = () => {
      if (observed || !("ResizeObserver" in window)) return;
      const stage = document.querySelector("[data-deck-root]");
      if (!stage) return;
      observed = true;
      const ro = new ResizeObserver(refit);
      const container = stage.parentElement?.parentElement;
      if (container) ro.observe(container);
      ro.observe(document.documentElement);
    };
    // The stage mounts after React hydrates, which on a cold bundler cache can
    // take longer than any fixed wait. Fit now if it is there; otherwise watch
    // the document until it appears, then fit and observe it.
    const discover = () => {
      fit();
      observeStage();
      return observed || rect !== null;
    };
    if (!discover()) {
      const untilStage = new MutationObserver(() => {
        if (discover()) untilStage.disconnect();
      });
      untilStage.observe(document.documentElement, { childList: true, subtree: true });
    }

    // The engine's swipe and edge-tap navigation listens for touch events on
    // the frame's window; a stroke or a comment tap on the overlay would
    // bubble out of the shadow root and flip the slide mid-mark. While a mode
    // is on, touches on the overlay end here.
    for (const type of ["touchstart", "touchmove", "touchend", "touchcancel"] as const) {
      overlay.addEventListener(type, (event) => {
        if (mode !== "off") event.stopPropagation();
      }, { passive: true });
    }

    let active: Point[] | null = null;
    overlay.addEventListener("pointerdown", (event) => {
      if (!rect) return;
      const p = toStage(event.clientX, event.clientY, rect);
      if (!onStage(p)) return;
      if (mode === "draw") {
        pinDraftSlide();
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
    // pointercancel (the browser took the pointer: a touch gesture, a lost
    // capture) ends the stroke the same way a release does.
    const endStroke = () => {
      if (active) emitDraft();
      active = null;
    };
    overlay.addEventListener("pointerup", endStroke);
    overlay.addEventListener("pointercancel", endStroke);

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
        pinDraftSlide();
        comments = [...comments, { x: pending[0], y: pending[1], text: cinput.value.trim(), target: elementHintAt(pending[0], pending[1], rect, overlay) }];
        cbox.style.display = "none";
        pending = null;
        redraw();
        emitDraft();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || mode === "off") return;
      // Leaving a mode is the whole meaning of this Escape; the deck's own
      // window handler (close the overview, help, QR) must not also run.
      event.stopPropagation();
      setMode("off");
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
    draftSlide = null;
    redraw();
    emitDraft();
  }

  // What each in-flight capture took, so the save acknowledgement spends only
  // those marks: anything drawn while the parent was persisting stays.
  const captured = new Map<string, { strokes: number; comments: number }>();

  function spendCaptured(id: string): void {
    const taken = captured.get(id);
    captured.delete(id);
    if (!taken) {
      clearDraft();
      return;
    }
    strokes = strokes.slice(taken.strokes);
    comments = comments.slice(taken.comments);
    if (strokes.length === 0 && comments.length === 0) draftSlide = null;
    redraw();
    emitDraft();
  }

  async function capture(id: string): Promise<void> {
    const snapshot = draft();
    captured.set(id, { strokes: snapshot.strokes.length, comments: snapshot.comments.length });
    let screenshot: Blob | null = null;
    if (snapshot.strokes.length || snapshot.comments.length) {
      // Re-measure so the crop follows the stage as it is now, not as it was
      // at the last resize notification.
      fit();
      try {
        screenshot = await captureAnnotated(snapshot.strokes, snapshot.comments, { excludeId: HOST_ID, rect });
      } catch {
        // the screenshot is a hint, never a blocker
      }
    }
    post({ type: "lst:captured", id, draft: snapshot, screenshot });
    // The draft is NOT cleared here: the parent still has to persist it, and a
    // failed save (network, 409, timeout) must leave the marks to retry with.
    // lst:draftSaved is the acknowledgement that spends it.
  }

  // ---------------------------------------------------------------- messages

  window.addEventListener("message", (event) => {
    if (event.source !== parent) return;
    if (handshake.state === "waiting") {
      handshake = acceptInit(handshake, event.origin, event.data, allowedOrigins);
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
      case "lst:draftSaved":
        spendCaptured(msg.id);
        if (strokes.length === 0 && comments.length === 0) setMode("off");
        break;
    }
  });

  post({ type: "lst:hello" }, home);
  // The shell may mount its message listener after this frame loaded (React
  // effects run post-paint; a fast deck can beat them). Re-greet until init
  // arrives so a missed hello cannot leave the bridge permanently deaf.
  const regreet = setInterval(() => {
    if (handshake.state === "ready") {
      clearInterval(regreet);
      return;
    }
    post({ type: "lst:hello" }, home);
  }, 500);
  setTimeout(() => clearInterval(regreet), 20_000);
}

boot();
