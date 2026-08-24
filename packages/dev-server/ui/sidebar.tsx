import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@fontsource-variable/schibsted-grotesk";
import "@fontsource-variable/jetbrains-mono";
import type { AnnotationEntry, DevTransport } from "../drawer/bridge";
import type { DevSidebarProps, FrameEvents, OverlayMode, SlideInfo } from "./types";
import "./sidebar.css";

// The authoring sidebar: a left column beside the deck frame, the way slide
// decks have always put their slide list. Plain React on plain CSS so the
// same component renders in the CLI's local shell page and inside the hosted
// dashboard; it never touches the deck's DOM (that is the in-frame bridge's
// job) and only speaks the transport and the frame-bridge contracts.

// ---------------------------------------------------------------- shell

export interface DevShellProps {
  sidebar: ReactNode;
  children: ReactNode;
  /** Below this width the sidebar overlays the frame instead of pushing it. */
  narrowBelow?: number;
  className?: string;
}

export function DevShell({ sidebar, children, narrowBelow = 860, className }: DevShellProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setNarrow((entry?.contentRect.width ?? Infinity) < narrowBelow));
    ro.observe(el);
    return () => ro.disconnect();
  }, [narrowBelow]);
  return (
    <div ref={ref} className={`lst-shell ${className ?? ""}`} data-narrow={String(narrow)}>
      {sidebar}
      <div className="lst-frame">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------- icons

// One stroke vocabulary (16px grid, 1.5px stroke) so the panel reads as a
// single tool; emoji render differently per OS and get read aloud.
function Icon({ d, label }: { d: string; label?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden={label ? undefined : true} role={label ? "img" : undefined}>
      {label && <title>{label}</title>}
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  pen: "M11.5 2.5l2 2L5 13H3v-2l8.5-8.5zM10 4l2 2",
  plus: "M8 3v10M3 8h10",
  comment: "M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z",
  send: "M14 2L2 6.5l5.5 2L9.5 14 14 2zM14 2L7.5 8.5",
  undo: "M6 4L2.5 7.5 6 11M2.5 7.5H10a3 3 0 010 6H8",
  close: "M4 4l8 8M12 4l-8 8",
  chevronLeft: "M10 3L5 8l5 5",
  chevronRight: "M6 3l5 5-5 5",
} as const;

// ---------------------------------------------------------------- state

interface DevState {
  entries: Record<string, AnnotationEntry>;
  agentPolling: boolean;
  /** An agent holds a batch and is working on it. */
  agentBusy: boolean;
  loaded: boolean;
  /** The server no longer accepts this page's token (it restarted); only a reload helps. */
  stale: boolean;
}

const STALE_HINT = "Dev server restarted: reload the page";

function useDevState(transport: DevTransport, toast: (text: string) => void) {
  const [state, setState] = useState<DevState>({ entries: {}, agentPolling: false, agentBusy: false, loaded: false, stale: false });
  const [failedBatch, setFailedBatch] = useState<string | null>(null);
  const markStale = useCallback(() => {
    setState((s) => (s.stale ? s : { ...s, agentPolling: false, agentBusy: false, stale: true }));
    toast(STALE_HINT);
  }, [toast]);
  const refresh = useCallback(async () => {
    try {
      const s = await transport.getState();
      setState((prev) => ({ ...prev, entries: s.annotations, agentPolling: s.agentPolling, agentBusy: Boolean(s.agentBusy), loaded: true }));
    } catch (err) {
      // A 401 is the one failure that never heals: the token in this page is
      // from a server that is gone. Anything else is transient; the next
      // event refreshes.
      if ((err as { status?: unknown })?.status === 401) markStale();
    }
  }, [transport, markStale]);

  useEffect(() => {
    void refresh();
    return transport.subscribe((msg) => {
      switch (msg.type) {
        case "connected":
        case "agent_polling":
          setState((s) => ({
            ...s,
            agentPolling: Boolean(msg.agentPolling ?? msg.connected ?? false),
            agentBusy: Boolean(msg.agentBusy ?? msg.busy ?? false),
          }));
          break;
        case "batch_dispatched":
          // A newer batch supersedes a failed one as the revert target; keeping
          // the stale id would make Revert restore the older snapshot and wipe
          // this batch's work with it.
          setFailedBatch(null);
          toast(msg.agentPolling ? "Sent to agent" : "Staged for the next agent session");
          void refresh();
          break;
        case "batch_resolved": {
          setFailedBatch(null);
          const applied = (msg.applied as string[])?.length ?? 0;
          const notes = (msg.notes as string[]) ?? [];
          toast(`Agent applied ${applied} annotation(s)${notes.length ? `: ${notes[0]}` : ""}`);
          void refresh();
          break;
        }
        case "batch_failed":
          toast(`Agent error: ${String(msg.message ?? "unknown")}${msg.revertable ? " (Revert puts the deck back)" : ""}`);
          if (msg.revertable && typeof msg.batchId === "string") setFailedBatch(msg.batchId);
          void refresh();
          break;
        case "batch_reverted": {
          // Restoring a snapshot also undoes every batch applied after it; the
          // server reopens those entries too and names the batches here.
          const reopened = Array.isArray(msg.reopenedBatches) ? (msg.reopenedBatches as string[]) : [];
          const later = reopened.filter((b) => b !== msg.batchId).length;
          toast(later > 0 ? `Batch reverted (with ${later} later batch${later === 1 ? "" : "es"} it had built on)` : "Batch reverted");
          setFailedBatch(null);
          if (reopened.length > 0) {
            const set = new Set(reopened);
            setState((s) => {
              const entries = { ...s.entries };
              for (const [id, e] of Object.entries(entries)) {
                if (e.batchId && set.has(e.batchId)) entries[id] = { ...e, status: "open", batchId: null };
              }
              return { ...s, entries };
            });
          }
          void refresh();
          break;
        }
        case "annotation_updated":
          void refresh();
          break;
        case "stream_closed":
          markStale();
          break;
        case "exit":
          toast("Dev server stopped");
          setState((s) => ({ ...s, agentPolling: false, agentBusy: false }));
          break;
      }
    });
  }, [transport, refresh, toast, markStale]);

  return { ...state, failedBatch, refresh };
}

const BUSY_SEND_HINT = "An agent is applying a batch; send the next one once it replies";

function useToast(): [string | null, (text: string) => void] {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toast = useCallback((t: string) => {
    setText(t);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setText(null), 3200);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [text, toast];
}

// ---------------------------------------------------------------- sidebar

export function DevSidebar(props: DevSidebarProps) {
  const { transport, bridge, onFrame, slides, initialSlide = 0 } = props;
  const [toastText, toast] = useToast();
  const dev = useDevState(transport, toast);
  const [collapsedState, setCollapsedState] = useState(false);
  const collapsed = props.collapsed ?? collapsedState;
  const setCollapsed = (next: boolean) => {
    setCollapsedState(next);
    props.onCollapsedChange?.(next);
  };

  const [frame, setFrame] = useState<FrameEvents>({
    slide: initialSlide,
    mode: "off",
    draft: { strokes: [], comments: [] },
  });
  useEffect(() => onFrame((event) => setFrame((f) => ({ ...f, ...event }))), [onFrame]);

  // Escape leaves draw/comment mode from anywhere in the sidebar.
  const asideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = asideRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && frame.mode !== "off") bridge.setMode("off");
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [bridge, frame.mode]);

  const entries = useMemo(
    () =>
      Object.values(dev.entries)
        .filter((e) => e.status !== "dismissed")
        .sort((a, b) => b.createdAt - a.createdAt),
    [dev.entries],
  );
  const openCount = entries.filter((e) => e.status === "open").length;
  // Slide requests still waiting: ghost rows in the list at the index they will take.
  const requests = useMemo(
    () => entries.filter((e) => e.kind === "add-slide" && (e.status === "open" || e.status === "dispatched")),
    [entries],
  );
  const perSlide = useMemo(() => {
    const map = new Map<number, { open: number; applied: number }>();
    for (const e of entries) {
      if (e.kind === "add-slide") continue;
      const cur = map.get(e.slide.index) ?? { open: 0, applied: 0 };
      if (e.status === "open" || e.status === "dispatched") cur.open += 1;
      if (e.status === "applied") cur.applied += 1;
      map.set(e.slide.index, cur);
    }
    return map;
  }, [entries]);
  const lastAppliedBatch = useMemo(() => {
    const applied = entries.filter((e) => e.status === "applied" && e.batchId).sort((a, b) => b.updatedAt - a.updatedAt);
    // A batch the agent gave up on keeps its snapshot; its entries are open
    // again, so it is tracked from the failure event rather than the store.
    return dev.failedBatch ?? applied[0]?.batchId ?? null;
  }, [entries, dev.failedBatch]);

  const draftCount = frame.draft.strokes.length + frame.draft.comments.length;

  // When a slide request turns applied, land the user on the new slide. The
  // first load seeds the set silently: requests applied in an earlier session
  // must not yank the deck to their slides on every page open.
  // The jump waits until the slide list actually has the new slide: the agent's
  // reply lands before hot reload has rebuilt the entry, and a goto past the
  // end would be clamped to the old last slide and never retried.
  const seenApplied = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!dev.loaded) return;
    const appliedRequests = entries.filter((e) => e.kind === "add-slide" && e.status === "applied");
    if (!seenApplied.current) {
      seenApplied.current = new Set(appliedRequests.map((e) => e.id));
      return;
    }
    for (const e of appliedRequests) {
      if (seenApplied.current.has(e.id)) continue;
      if (slides.length <= e.slide.index) continue;
      seenApplied.current.add(e.id);
      bridge.goto(e.slide.index);
    }
  }, [entries, slides, dev.loaded, bridge]);

  // Insert affordance state: the `after` index being described, or null.
  const [insertAfter, setInsertAfter] = useState<number | null>(null);
  async function addSlide(after: number, description: string): Promise<void> {
    const text = description.trim();
    if (!text) return;
    try {
      await transport.saveAnnotation({ kind: "add-slide", request: { after, description: text }, slideIndex: after + 1, comments: [], strokes: [] });
      setInsertAfter(null);
      toast("Slide request saved: send it to the agent");
      void dev.refresh();
    } catch (err) {
      toast(`Could not save: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const setMode = (next: OverlayMode) => bridge.setMode(frame.mode === next ? "off" : next);

  async function save(): Promise<void> {
    if (draftCount === 0) {
      toast("Nothing to save yet: draw or comment first");
      return;
    }
    try {
      const id = await bridge.saveDraft();
      toast(id ? "Annotation saved" : "Nothing to save");
      void dev.refresh();
    } catch (err) {
      toast(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function send(): Promise<void> {
    try {
      const result = await transport.dispatch();
      if (!result.agentPolling) toast("Staged: no agent is polling; run `liebstoeckel dev poll`");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast(
        message === "nothing_to_dispatch"
          ? "No open annotations to send"
          : message === "agent_busy"
            ? BUSY_SEND_HINT
            : `Send failed: ${message}`,
      );
    }
  }

  async function revert(): Promise<void> {
    if (!lastAppliedBatch) return;
    try {
      await transport.revert(lastAppliedBatch);
      void dev.refresh();
    } catch (err) {
      toast(`Revert failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function dismiss(id: string): Promise<void> {
    try {
      await transport.setStatus(id, "dismissed");
      void dev.refresh();
    } catch (err) {
      toast(`Dismiss failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Three states, in priority: working on a batch, waiting for one, nobody there.
  const presence = dev.stale ? "server restarted" : dev.agentBusy ? "agent working" : dev.agentPolling ? "agent polling" : "agent offline";
  // A batch snapshots the whole source tree as it is at dispatch, so a second
  // batch sent while an agent is mid-edit would freeze its half-done work as
  // the state Revert returns to. One batch at a time.
  const canSend = openCount > 0 && !dev.agentBusy;
  const sendTitle = dev.agentBusy ? BUSY_SEND_HINT : "Send to agent";
  const dotState = dev.agentBusy ? "busy" : dev.agentPolling ? "on" : "off";

  return (
    <aside ref={asideRef} className="lst-sidebar" data-collapsed={String(collapsed)} aria-label="liebstoeckel dev">
      <header className="lst-hdr">
        <button
          type="button"
          className="lst-icon-btn"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
        >
          <Icon d={collapsed ? ICONS.chevronRight : ICONS.chevronLeft} />
        </button>
        <div className="lst-hdr-text">
          <b>liebstoeckel dev</b>
          <span className="lst-agent">
            <span className="lst-dot" data-state={dotState} />
            {presence}
          </span>
        </div>
      </header>

      <div className="lst-rail" aria-hidden={!collapsed}>
        <span className="lst-dot" data-state={dotState} title={presence} />
        {openCount > 0 && <span className="lst-badge" title={`${openCount} open annotation(s)`}>{openCount}</span>}
        <button
          type="button"
          className="lst-icon-btn"
          title={sendTitle}
          aria-label="Send to agent"
          disabled={!canSend}
          onClick={() => void send()}
        >
          <Icon d={ICONS.send} />
        </button>
      </div>

      <div className="lst-body">
        <section className="lst-section" aria-labelledby="lst-h-slides">
          <h2 className="lst-section-hdr" id="lst-h-slides">
            <span>Slides</span>
            <span className="lst-count">{slides.length}</span>
          </h2>
          <SlideList
            slides={slides}
            current={frame.slide}
            perSlide={perSlide}
            requests={requests}
            insertAfter={insertAfter}
            onInsert={setInsertAfter}
            onAdd={addSlide}
            onGoto={(i) => bridge.goto(i)}
          />
        </section>

        <section className="lst-section" aria-labelledby="lst-h-annotate">
          <h2 className="lst-section-hdr" id="lst-h-annotate">
            <span>Annotate slide {frame.slide + 1}</span>
          </h2>
          <div className="lst-tools">
            <div className="lst-row" role="group" aria-label="Overlay mode">
              <button type="button" className="lst-btn" aria-pressed={frame.mode === "draw"} data-active={String(frame.mode === "draw")} onClick={() => setMode("draw")}>
                <Icon d={ICONS.pen} /> Draw
              </button>
              <button type="button" className="lst-btn" aria-pressed={frame.mode === "comment"} data-active={String(frame.mode === "comment")} onClick={() => setMode("comment")}>
                <Icon d={ICONS.comment} /> Comment
              </button>
            </div>
            <div className="lst-draft" data-empty={String(draftCount === 0)}>
              <span>
                {draftCount === 0
                  ? "No marks on this slide yet"
                  : `${frame.draft.strokes.length} stroke(s), ${frame.draft.comments.length} comment(s)`}
              </span>
              <span className="lst-row">
                <button type="button" className="lst-btn" disabled={draftCount === 0} onClick={() => bridge.clearDraft()}>
                  Clear
                </button>
                <button type="button" className="lst-btn" disabled={draftCount === 0} onClick={() => void save()}>
                  Save
                </button>
              </span>
            </div>
            <p className="lst-hint">Mark the slide, save, then send. The agent edits the source; hot reload shows it.</p>
          </div>
        </section>

        <section className="lst-section" aria-labelledby="lst-h-entries">
          <h2 className="lst-section-hdr" id="lst-h-entries">
            <span>Annotations</span>
            <span className="lst-count">{openCount} open</span>
          </h2>
          {entries.length === 0 ? (
            <div className="lst-empty">{dev.stale ? STALE_HINT : dev.loaded ? "Nothing saved yet. Mark a slide above to start." : "Loading"}</div>
          ) : (
            <EntryList entries={entries.slice(0, 30)} onDismiss={(id) => void dismiss(id)} />
          )}
        </section>
      </div>

      <footer className="lst-footer">
        <button type="button" className="lst-btn" data-primary="true" disabled={!canSend} title={sendTitle} onClick={() => void send()}>
          Send to agent <Icon d={ICONS.send} />
        </button>
        <button
          type="button"
          className="lst-btn"
          disabled={!lastAppliedBatch || dev.agentBusy}
          title={dev.agentBusy ? "An agent is applying a batch; revert once it replies" : "Revert the last applied batch"}
          onClick={() => void revert()}
        >
          <Icon d={ICONS.undo} /> Revert
        </button>
      </footer>

      <div className="lst-toast" data-on={String(toastText !== null)} role="status" aria-live="polite">
        {toastText}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------- pieces

function SlideList({
  slides,
  current,
  perSlide,
  requests,
  insertAfter,
  onInsert,
  onAdd,
  onGoto,
}: {
  slides: SlideInfo[];
  current: number;
  perSlide: Map<number, { open: number; applied: number }>;
  requests: AnnotationEntry[];
  insertAfter: number | null;
  onInsert: (after: number | null) => void;
  onAdd: (after: number, description: string) => Promise<void>;
  onGoto: (index: number) => void;
}) {
  // Rows in display order: for each position, the pending requests queued
  // after the previous slide (in creation order, so adding "at the end" twice
  // chains them), then the insert affordance, then the slide itself; one more
  // ghost group and affordance after the last slide. The "+" always means
  // "here, below everything above it".
  const rows: ReactNode[] = [];
  const ghostsAfter = (after: number) =>
    requests
      .filter((r) => (r.request?.after ?? r.slide.index - 1) === after)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((r, k) => (
        <li key={`ghost-${r.id}`}>
          <div className="lst-slide lst-ghost" aria-label={`pending new slide: ${r.request?.description ?? ""}`}>
            <span className="lst-slide-num">{after + 2 + k}</span>
            <span className="lst-slide-name">{r.request?.description}</span>
            <span className="lst-chip" data-s={r.status}>
              {r.status === "dispatched" ? "working" : "new"}
            </span>
          </div>
        </li>
      ));
  const insert = (after: number) => (
    <li key={`insert-${after}`} className="lst-insert-row">
      {insertAfter === after ? (
        <InsertForm after={after} onCancel={() => onInsert(null)} onAdd={onAdd} />
      ) : (
        <button type="button" className="lst-insert" title={after < 0 ? "Add a slide first" : `Add a slide after slide ${after + 1}`} aria-label={after < 0 ? "Add a slide first" : `Add a slide after slide ${after + 1}`} onClick={() => onInsert(after)}>
          <span className="lst-insert-line" />
          <span className="lst-insert-plus">
            <Icon d={ICONS.plus} />
          </span>
          <span className="lst-insert-line" />
        </button>
      )}
    </li>
  );
  for (const slide of slides) {
    rows.push(...ghostsAfter(slide.index - 1));
    rows.push(insert(slide.index - 1));
    const counts = perSlide.get(slide.index);
    const name = slide.sourceFile ? slide.sourceFile.split("/").pop()! : "";
    const isCurrent = slide.index === current;
    rows.push(
      <li key={slide.index}>
        <button type="button" className="lst-slide" aria-current={isCurrent ? "true" : undefined} onClick={() => onGoto(slide.index)}>
          <span className="lst-slide-num">{slide.index + 1}</span>
          <span className="lst-slide-name">{name || <i>unresolved</i>}</span>
          <span className="lst-row">
            {counts?.open ? <span className="lst-badge" title={`${counts.open} open`}>{counts.open}</span> : null}
            {counts?.applied ? <span className="lst-badge" data-kind="applied" title={`${counts.applied} applied`}>{counts.applied}</span> : null}
          </span>
        </button>
      </li>,
    );
  }
  rows.push(...ghostsAfter(slides.length - 1));
  rows.push(insert(slides.length - 1));
  return <ol className="lst-slides">{rows}</ol>;
}

function InsertForm({ after, onCancel, onAdd }: { after: number; onCancel: () => void; onAdd: (after: number, description: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    await onAdd(after, text);
    setBusy(false);
  };
  return (
    <form
      className="lst-insert-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <input
        ref={ref}
        className="lst-input"
        value={text}
        placeholder={after < 0 ? "New first slide: what should it show?" : `New slide after ${after + 1}: what should it show?`}
        aria-label="Describe the new slide"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
      />
      <span className="lst-row">
        <button type="button" className="lst-btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="lst-btn" data-primary="true" disabled={!text.trim() || busy}>
          Add
        </button>
      </span>
    </form>
  );
}

function EntryList({ entries, onDismiss }: { entries: AnnotationEntry[]; onDismiss: (id: string) => void }) {
  return (
    <ul className="lst-entries">
      {entries.map((entry) => (
        <li key={entry.id} className="lst-entry" data-status={entry.status}>
          <div className="lst-meta">
            <span>
              {entry.kind === "add-slide"
                ? `new slide ${entry.slide.index + 1}${entry.request && entry.request.after >= 0 ? `, after ${entry.request.after + 1}` : ", first"}`
                : `slide ${entry.slide.index + 1}${entry.slide.sourceFile ? `, ${entry.slide.sourceFile.split("/").pop()}` : ""}`}
            </span>
            <span className="lst-chip" data-s={entry.status}>
              {entry.status}
            </span>
            {entry.status !== "dispatched" && (
              // An entry with the agent is locked until it replies: dismissing
              // it mid-batch would make the agent's reply fail or undo the
              // dismissal, and the server refuses it anyway.
              <button type="button" className="lst-x" title="Dismiss" aria-label="Dismiss annotation" onClick={() => onDismiss(entry.id)}>
                <Icon d={ICONS.close} />
              </button>
            )}
          </div>
          {entry.kind === "add-slide" && entry.request ? (
            <div className="lst-txt">{entry.request.description}</div>
          ) : (
            entry.comments.length > 0 && <div className="lst-txt">{entry.comments.map((c) => c.text).join("\n")}</div>
          )}
        </li>
      ))}
    </ul>
  );
}
