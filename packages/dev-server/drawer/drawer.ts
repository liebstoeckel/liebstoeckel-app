// The dev-mode drawer: injected by the loader tag when a dev server answers
// /__dev/ping. Self-contained: renders into its own shadow root (deck styles
// and Tailwind can never touch it), talks to the server through a Transport
// interface so a hosted variant can swap the wire without touching tool code,
// and registers tools through a registry so later authoring tools slot in
// beside annotations without changes to the shell.

import { domToPng } from "modern-screenshot";

declare global {
  interface Window {
    __LIEBSTOECKEL_DEV__?: { token: string };
  }
}

type Point = [number, number];

interface CommentDraft {
  x: number;
  y: number;
  text: string;
  target?: { tag?: string; classes?: string[]; text?: string };
}

interface AnnotationEntry {
  id: string;
  slide: { index: number; sourceFile: string | null };
  comments: CommentDraft[];
  strokes: Array<{ points: Point[] }>;
  screenshot: string | null;
  status: "open" | "dispatched" | "applied" | "dismissed";
  batchId: string | null;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Transport: the only place that knows the wire. A hosted variant implements
// this same interface over postMessage or the control-plane API.
// ---------------------------------------------------------------------------

interface DevTransport {
  getState(): Promise<{ annotations: Record<string, AnnotationEntry>; agentPolling: boolean }>;
  saveAnnotation(input: { slideIndex: number; comments: CommentDraft[]; strokes: Array<{ points: Point[] }> }): Promise<AnnotationEntry>;
  uploadScreenshot(id: string, png: Blob): Promise<void>;
  setStatus(id: string, status: "dismissed" | "open"): Promise<void>;
  dispatch(): Promise<{ batchId: string; agentPolling: boolean }>;
  revert(batchId: string): Promise<void>;
  subscribe(onMessage: (msg: Record<string, unknown>) => void): void;
}

function httpTransport(token: string): DevTransport {
  const authed = (path: string) => `${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
  async function post(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, ...body }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(String(data.error ?? res.statusText));
    return data;
  }
  return {
    async getState() {
      const res = await fetch(authed("/__dev/state"));
      if (!res.ok) throw new Error("state fetch failed");
      return (await res.json()) as { annotations: Record<string, AnnotationEntry>; agentPolling: boolean };
    },
    async saveAnnotation(input) {
      const data = await post("/__dev/annotations", input as unknown as Record<string, unknown>);
      return data.entry as unknown as AnnotationEntry;
    },
    async uploadScreenshot(id, png) {
      await fetch(authed(`/__dev/screenshot?id=${encodeURIComponent(id)}`), {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: png,
      });
    },
    async setStatus(id, status) {
      await post("/__dev/annotation-status", { id, status });
    },
    async dispatch() {
      const data = await post("/__dev/dispatch", {});
      return data as unknown as { batchId: string; agentPolling: boolean };
    },
    async revert(batchId) {
      await post("/__dev/revert", { batchId });
    },
    subscribe(onMessage) {
      const source = new EventSource(authed("/__dev/events"));
      source.onmessage = (event) => {
        try {
          onMessage(JSON.parse(event.data));
        } catch {
          // ignore malformed frames
        }
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Tool registry: the SaaS seam. Tools mount into the panel body the shell owns.
// ---------------------------------------------------------------------------

interface DevToolContext {
  transport: DevTransport;
  currentSlide: () => number;
  toast: (text: string) => void;
  refresh: () => void;
}

interface DevTool {
  id: string;
  label: string;
  mount: (body: HTMLElement, ctx: DevToolContext) => void;
}

const tools: DevTool[] = [];

// Exposed on window (not exported: the bundle loads as a classic script) so a
// hosted variant can register additional tools beside annotations.
function registerDevTool(tool: DevTool): void {
  tools.push(tool);
}
(window as unknown as Record<string, unknown>).__LIEBSTOECKEL_DEV_REGISTER_TOOL__ = registerDevTool;

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const HOST_ID = "lst-dev-host";

function boot(): void {
  const config = window.__LIEBSTOECKEL_DEV__;
  if (!config?.token || document.getElementById(HOST_ID)) return;
  const transport = httpTransport(config.token);

  // Current slide via the engine's cross-window sync channel (read-only).
  let slideIndex = 0;
  try {
    const channel = new BroadcastChannel("liebstoeckel");
    channel.onmessage = (event) => {
      const msg = event.data as { type?: string; index?: number };
      if (msg?.type === "state" && typeof msg.index === "number") {
        slideIndex = msg.index;
        shell.onSlideChange();
      }
    };
    channel.postMessage({ type: "request" });
  } catch {
    // no channel support: annotations land on slide 0
  }

  const shell = createShell(transport, () => slideIndex);
  registerAnnotationTool();
  shell.mountTools();
}

// ---------------------------------------------------------------------------
// Shell: host, shadow root, pill, panel, toasts, agent dot
// ---------------------------------------------------------------------------

const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: system-ui, sans-serif; }
  .pill {
    position: fixed; right: 14px; bottom: 14px; z-index: 2147483000;
    display: inline-flex; align-items: center; gap: 7px;
    background: rgba(18,18,20,.92); color: #f5f2ea; border: 1px solid rgba(255,255,255,.14);
    border-radius: 999px; padding: 8px 14px; font-size: 12.5px; letter-spacing: .02em;
    cursor: pointer; user-select: none; backdrop-filter: blur(6px);
  }
  .pill:hover { border-color: rgba(212,175,55,.55); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: #666; }
  .dot[data-on="true"] { background: #58c777; box-shadow: 0 0 6px rgba(88,199,119,.8); }
  .panel {
    position: fixed; right: 14px; bottom: 56px; z-index: 2147483000; width: 300px;
    max-height: 66vh; overflow: auto; background: rgba(18,18,20,.96); color: #f5f2ea;
    border: 1px solid rgba(255,255,255,.14); border-radius: 12px; padding: 12px;
    font-size: 12.5px; display: none; backdrop-filter: blur(8px);
  }
  .panel[data-open="true"] { display: block; }
  .hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .hdr b { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: #d4af37; }
  .hint { color: #9a958a; font-size: 11.5px; margin: 6px 0; line-height: 1.45; }
  button.act {
    background: rgba(255,255,255,.08); color: inherit; border: 1px solid rgba(255,255,255,.16);
    border-radius: 7px; padding: 6px 10px; font-size: 12px; cursor: pointer; margin: 2px 4px 2px 0;
  }
  button.act:hover { border-color: rgba(212,175,55,.55); }
  button.act[data-active="true"] { background: rgba(212,175,55,.2); border-color: #d4af37; }
  button.act.primary { background: #d4af37; color: #1a1a1c; font-weight: 600; }
  button.act:disabled { opacity: .45; cursor: not-allowed; }
  .entry { border: 1px solid rgba(255,255,255,.1); border-radius: 8px; padding: 7px 9px; margin: 6px 0; }
  .entry .meta { display: flex; justify-content: space-between; align-items: center; gap: 6px; }
  .chip { font-size: 10px; padding: 1px 7px; border-radius: 999px; border: 1px solid rgba(255,255,255,.2); }
  .chip[data-s="open"] { color: #f0d27a; border-color: rgba(212,175,55,.5); }
  .chip[data-s="dispatched"] { color: #8db9ff; border-color: rgba(120,160,255,.5); }
  .chip[data-s="applied"] { color: #8fe3a8; border-color: rgba(88,199,119,.5); }
  .entry .txt { color: #cfcabf; margin-top: 4px; white-space: pre-wrap; }
  .x { background: none; border: none; color: #9a958a; cursor: pointer; font-size: 13px; }
  .x:hover { color: #f5f2ea; }
  .overlay { position: fixed; inset: 0; z-index: 2147482000; cursor: crosshair; display: none; touch-action: none; }
  .overlay[data-on="true"] { display: block; }
  .cbox {
    position: fixed; z-index: 2147483100; background: rgba(18,18,20,.97); border: 1px solid #d4af37;
    border-radius: 8px; padding: 6px; display: none;
  }
  .cbox input { background: rgba(255,255,255,.06); color: #f5f2ea; border: 1px solid rgba(255,255,255,.2);
    border-radius: 6px; padding: 5px 8px; font-size: 12.5px; width: 220px; outline: none; }
  .toast {
    position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 2147483200;
    background: rgba(18,18,20,.95); color: #f5f2ea; border: 1px solid rgba(212,175,55,.5);
    border-radius: 999px; padding: 7px 16px; font-size: 12.5px; opacity: 0; transition: opacity .18s;
    pointer-events: none; max-width: 76vw; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .toast[data-on="true"] { opacity: 1; }
`;

interface Shell {
  mountTools: () => void;
  onSlideChange: () => void;
}

function createShell(transport: DevTransport, currentSlide: () => number): Shell {
  const host = document.createElement("div");
  host.id = HOST_ID;
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = CSS;
  root.appendChild(style);

  const pill = document.createElement("button");
  pill.className = "pill";
  const dot = document.createElement("span");
  dot.className = "dot";
  const pillLabel = document.createElement("span");
  pillLabel.textContent = "dev";
  pill.append(dot, pillLabel);
  root.appendChild(pill);

  const panel = document.createElement("div");
  panel.className = "panel";
  const hdr = document.createElement("div");
  hdr.className = "hdr";
  const title = document.createElement("b");
  title.textContent = "liebstoeckel dev";
  const agentLabel = document.createElement("span");
  agentLabel.className = "hint";
  agentLabel.textContent = "agent: offline";
  hdr.append(title, agentLabel);
  panel.appendChild(hdr);
  const toolBody = document.createElement("div");
  panel.appendChild(toolBody);
  root.appendChild(panel);

  const toastEl = document.createElement("div");
  toastEl.className = "toast";
  root.appendChild(toastEl);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const toast = (text: string) => {
    toastEl.textContent = text;
    toastEl.dataset.on = "true";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.dataset.on = "false";
    }, 3200);
  };

  pill.addEventListener("click", () => {
    panel.dataset.open = panel.dataset.open === "true" ? "false" : "true";
  });

  let refreshFn: () => void = () => {};
  const ctx: DevToolContext = {
    transport,
    currentSlide,
    toast,
    refresh: () => refreshFn(),
  };

  transport.subscribe((msg) => {
    switch (msg.type) {
      case "connected":
      case "agent_polling":
        dot.dataset.on = String(msg.agentPolling ?? msg.connected ?? false);
        agentLabel.textContent = dot.dataset.on === "true" ? "agent: polling" : "agent: offline";
        break;
      case "batch_dispatched":
        toast(msg.agentPolling ? "Sent to agent" : "Staged: saved for the next agent session");
        refreshFn();
        break;
      case "batch_resolved": {
        const applied = (msg.applied as string[])?.length ?? 0;
        const notes = (msg.notes as string[]) ?? [];
        toast(`Agent applied ${applied} annotation(s)${notes.length ? `: ${notes[0]}` : ""}`);
        refreshFn();
        break;
      }
      case "batch_failed":
        toast(`Agent error: ${String(msg.message ?? "unknown")}`);
        refreshFn();
        break;
      case "batch_reverted":
        toast("Batch reverted");
        refreshFn();
        break;
      case "annotation_updated":
        refreshFn();
        break;
      case "exit":
        toast("Dev server stopped");
        dot.dataset.on = "false";
        break;
    }
  });

  return {
    mountTools: () => {
      // v1 hosts a single tool; the registry keeps the seam for more.
      const tool = tools[0];
      if (!tool) return;
      tool.mount(toolBody, ctx);
      refreshFn = () => (toolBody.dispatchEvent(new CustomEvent("lst-refresh")), undefined);
      refreshFn();
    },
    onSlideChange: () => refreshFn(),
  };
}

// ---------------------------------------------------------------------------
// Annotations tool
// ---------------------------------------------------------------------------

function registerAnnotationTool(): void {
  registerDevTool({
    id: "annotations",
    label: "Annotate",
    mount(body, ctx) {
      const root = body.getRootNode() as ShadowRoot;

      // Draft state accumulated on the overlay until Save.
      let strokes: Array<{ points: Point[] }> = [];
      let comments: CommentDraft[] = [];
      let mode: "off" | "draw" | "comment" = "off";
      let lastAppliedBatch: string | null = null;

      // Overlay canvas (viewport-relative coordinates, 0..1).
      const overlay = document.createElement("canvas");
      overlay.className = "overlay";
      root.appendChild(overlay);
      const octx = overlay.getContext("2d")!;

      function sizeOverlay(): void {
        overlay.width = window.innerWidth * devicePixelRatio;
        overlay.height = window.innerHeight * devicePixelRatio;
        overlay.style.width = "100vw";
        overlay.style.height = "100vh";
        redraw();
      }
      window.addEventListener("resize", sizeOverlay);
      sizeOverlay();

      function redraw(target: CanvasRenderingContext2D = octx, w = overlay.width, h = overlay.height): void {
        if (target === octx) target.clearRect(0, 0, w, h);
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

      // Drawing
      let active: Point[] | null = null;
      overlay.addEventListener("pointerdown", (event) => {
        if (mode === "draw") {
          active = [[event.clientX / window.innerWidth, event.clientY / window.innerHeight]];
          strokes = [...strokes, { points: active }];
          overlay.setPointerCapture(event.pointerId);
        } else if (mode === "comment") {
          openCommentBox(event.clientX, event.clientY);
        }
      });
      overlay.addEventListener("pointermove", (event) => {
        if (!active) return;
        active.push([event.clientX / window.innerWidth, event.clientY / window.innerHeight]);
        redraw();
      });
      overlay.addEventListener("pointerup", () => {
        active = null;
      });

      // Comment input box
      const cbox = document.createElement("div");
      cbox.className = "cbox";
      const cinput = document.createElement("input");
      cinput.placeholder = "Comment, Enter to add";
      cbox.appendChild(cinput);
      root.appendChild(cbox);
      let pendingPoint: { x: number; y: number } | null = null;

      function openCommentBox(clientX: number, clientY: number): void {
        pendingPoint = { x: clientX / window.innerWidth, y: clientY / window.innerHeight };
        cbox.style.left = `${Math.min(clientX, window.innerWidth - 250)}px`;
        cbox.style.top = `${Math.min(clientY + 8, window.innerHeight - 48)}px`;
        cbox.style.display = "block";
        cinput.value = "";
        cinput.focus();
      }

      cinput.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          cbox.style.display = "none";
          pendingPoint = null;
        }
        if (event.key === "Enter" && cinput.value.trim() && pendingPoint) {
          // Element hint: sample what is under the point with the overlay muted.
          overlay.style.pointerEvents = "none";
          const el = document.elementFromPoint(
            pendingPoint.x * window.innerWidth,
            pendingPoint.y * window.innerHeight,
          ) as HTMLElement | null;
          overlay.style.pointerEvents = "";
          comments = [
            ...comments,
            {
              ...pendingPoint,
              text: cinput.value.trim(),
              target: el
                ? {
                    tag: el.tagName.toLowerCase(),
                    classes: [...el.classList].slice(0, 8),
                    text: (el.textContent ?? "").trim().slice(0, 80),
                  }
                : undefined,
            },
          ];
          cbox.style.display = "none";
          pendingPoint = null;
          redraw();
        }
      });

      // Controls
      const controls = document.createElement("div");
      const drawBtn = button("✏ Draw", () => setMode(mode === "draw" ? "off" : "draw"));
      const commentBtn = button("💬 Comment", () => setMode(mode === "comment" ? "off" : "comment"));
      const saveBtn = button("Save annotation", saveDraft);
      const clearBtn = button("Clear", () => {
        strokes = [];
        comments = [];
        redraw();
      });
      controls.append(drawBtn, commentBtn, saveBtn, clearBtn);
      body.appendChild(controls);

      const sendBtn = button("Send to agent →", sendToAgent);
      sendBtn.classList.add("primary");
      const revertBtn = button("Revert last batch", async () => {
        if (!lastAppliedBatch) return;
        await ctx.transport.revert(lastAppliedBatch);
        lastAppliedBatch = null;
        ctx.refresh();
      });
      const sendRow = document.createElement("div");
      sendRow.append(sendBtn, revertBtn);
      body.appendChild(sendRow);

      const hint = document.createElement("div");
      hint.className = "hint";
      hint.textContent = "Draw strokes and drop comments on the slide, Save, then Send. The agent edits the slide source; HMR shows it.";
      body.appendChild(hint);

      const list = document.createElement("div");
      body.appendChild(list);

      function button(label: string, onClick: () => void): HTMLButtonElement {
        const el = document.createElement("button");
        el.className = "act";
        el.textContent = label;
        el.addEventListener("click", onClick);
        return el;
      }

      function setMode(next: "off" | "draw" | "comment"): void {
        mode = next;
        overlay.dataset.on = String(mode !== "off");
        drawBtn.dataset.active = String(mode === "draw");
        commentBtn.dataset.active = String(mode === "comment");
      }

      async function saveDraft(): Promise<void> {
        if (strokes.length === 0 && comments.length === 0) {
          ctx.toast("Nothing to save yet: draw or comment first");
          return;
        }
        const draftStrokes = strokes;
        const draftComments = comments;
        try {
          const entry = await ctx.transport.saveAnnotation({
            slideIndex: ctx.currentSlide(),
            comments: draftComments,
            strokes: draftStrokes,
          });
          // Annotated screenshot: page pixels with the draft composited on top.
          // Captured only because annotations exist; an unannotated screenshot
          // would anchor the agent on the current design.
          try {
            const png = await captureAnnotated(draftStrokes, draftComments);
            if (png) await ctx.transport.uploadScreenshot(entry.id, png);
          } catch {
            // screenshot is a hint, never a blocker
          }
          strokes = [];
          comments = [];
          redraw();
          setMode("off");
          ctx.toast("Annotation saved");
          ctx.refresh();
        } catch (err) {
          ctx.toast(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      async function captureAnnotated(
        capturedStrokes: Array<{ points: Point[] }>,
        capturedComments: CommentDraft[],
      ): Promise<Blob | null> {
        const dataUrl = await domToPng(document.body, {
          filter: (node) => !(node instanceof Element && node.id === HOST_ID),
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
        const prevStrokes = strokes;
        const prevComments = comments;
        strokes = capturedStrokes;
        comments = capturedComments;
        redraw(cctx, canvas.width, canvas.height);
        strokes = prevStrokes;
        comments = prevComments;
        return await new Promise((resolveBlob) => canvas.toBlob(resolveBlob, "image/png"));
      }

      async function sendToAgent(): Promise<void> {
        try {
          const result = await ctx.transport.dispatch();
          if (!result.agentPolling) {
            ctx.toast("Staged: no agent is polling; run `liebstoeckel dev poll`");
          }
        } catch (err) {
          ctx.toast(err instanceof Error && err.message === "nothing_to_dispatch"
            ? "No open annotations to send"
            : `Send failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      async function renderList(): Promise<void> {
        try {
          const stateData = await ctx.transport.getState();
          const entries = Object.values(stateData.annotations)
            .filter((entry) => entry.status !== "dismissed")
            .sort((a, b) => b.createdAt - a.createdAt);
          const applied = entries.filter((entry) => entry.status === "applied" && entry.batchId);
          lastAppliedBatch = applied.length
            ? applied.sort((a, b) => b.updatedAt - a.updatedAt)[0]!.batchId
            : null;
          revertBtn.disabled = !lastAppliedBatch;
          sendBtn.disabled = !entries.some((entry) => entry.status === "open");
          list.textContent = "";
          for (const entry of entries.slice(0, 20)) {
            const item = document.createElement("div");
            item.className = "entry";
            const meta = document.createElement("div");
            meta.className = "meta";
            const label = document.createElement("span");
            label.textContent = `slide ${entry.slide.index + 1}${entry.slide.sourceFile ? ` (${entry.slide.sourceFile.split("/").pop()})` : ""}`;
            const chip = document.createElement("span");
            chip.className = "chip";
            chip.dataset.s = entry.status;
            chip.textContent = entry.status;
            const dismiss = document.createElement("button");
            dismiss.className = "x";
            dismiss.textContent = "✕";
            dismiss.title = "Dismiss";
            dismiss.addEventListener("click", async () => {
              await ctx.transport.setStatus(entry.id, "dismissed");
              ctx.refresh();
            });
            meta.append(label, chip, dismiss);
            item.appendChild(meta);
            if (entry.comments.length) {
              const txt = document.createElement("div");
              txt.className = "txt";
              txt.textContent = entry.comments.map((comment) => comment.text).join("\n");
              item.appendChild(txt);
            }
            list.appendChild(item);
          }
        } catch {
          // transient; next refresh wins
        }
      }

      body.addEventListener("lst-refresh", () => void renderList());
      void renderList();
    },
  });
}

boot();
