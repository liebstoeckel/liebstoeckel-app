import {
  type CommentDraft,
  type Point,
  type StrokeDraft,
  captureAnnotated,
  drawAnnotations,
  elementHintAt,
  registerDevTool,
} from "../bridge";
import { HOST_ID } from "../shell";

// Tool #1: live annotations. Draw strokes and drop comments on the slide,
// save them as an entry, send the open batch to the agent, revert the last
// applied batch. The tool mounts into the shell's panel body and talks to the
// server only through the transport it is handed.

export function registerAnnotationTool(): void {
  registerDevTool({
    id: "annotations",
    label: "Annotate",
    mount(body, ctx) {
      const root = body.getRootNode() as ShadowRoot;

      // Draft state accumulated on the overlay until Save.
      let strokes: StrokeDraft[] = [];
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

      function redraw(): void {
        octx.clearRect(0, 0, overlay.width, overlay.height);
        drawAnnotations(octx, overlay.width, overlay.height, strokes, comments);
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
          comments = [
            ...comments,
            {
              ...pendingPoint,
              text: cinput.value.trim(),
              target: elementHintAt(pendingPoint.x, pendingPoint.y, overlay),
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
          try {
            const png = await captureAnnotated(draftStrokes, draftComments, { excludeId: HOST_ID });
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
