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
}

function useDevState(transport: DevTransport, toast: (text: string) => void) {
  const [state, setState] = useState<DevState>({ entries: {}, agentPolling: false, agentBusy: false, loaded: false });
  const refresh = useCallback(async () => {
    try {
      const s = await transport.getState();
      setState({ entries: s.annotations, agentPolling: s.agentPolling, agentBusy: Boolean(s.agentBusy), loaded: true });
    } catch {
      // transient; the next event refreshes
    }
  }, [transport]);

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
          toast(msg.agentPolling ? "Sent to agent" : "Staged for the next agent session");
          void refresh();
          break;
        case "batch_resolved": {
          const applied = (msg.applied as string[])?.length ?? 0;
          const notes = (msg.notes as string[]) ?? [];
          toast(`Agent applied ${applied} annotation(s)${notes.length ? `: ${notes[0]}` : ""}`);
          void refresh();
          break;
        }
        case "batch_failed":
          toast(`Agent error: ${String(msg.message ?? "unknown")}`);
          void refresh();
          break;
        case "batch_reverted":
          toast("Batch reverted");
          void refresh();
          break;
        case "annotation_updated":
          void refresh();
          break;
        case "exit":
          toast("Dev server stopped");
          setState((s) => ({ ...s, agentPolling: false, agentBusy: false }));
          break;
      }
    });
  }, [transport, refresh, toast]);

  return { ...state, refresh };
}

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
  const perSlide = useMemo(() => {
    const map = new Map<number, { open: number; applied: number }>();
    for (const e of entries) {
      const cur = map.get(e.slide.index) ?? { open: 0, applied: 0 };
      if (e.status === "open" || e.status === "dispatched") cur.open += 1;
      if (e.status === "applied") cur.applied += 1;
      map.set(e.slide.index, cur);
    }
    return map;
  }, [entries]);
  const lastAppliedBatch = useMemo(() => {
    const applied = entries.filter((e) => e.status === "applied" && e.batchId).sort((a, b) => b.updatedAt - a.updatedAt);
    return applied[0]?.batchId ?? null;
  }, [entries]);

  const draftCount = frame.draft.strokes.length + frame.draft.comments.length;

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
      toast(err instanceof Error && err.message === "nothing_to_dispatch"
        ? "No open annotations to send"
        : `Send failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function revert(): Promise<void> {
    if (!lastAppliedBatch) return;
    await transport.revert(lastAppliedBatch);
    void dev.refresh();
  }

  // Three states, in priority: working on a batch, waiting for one, nobody there.
  const presence = dev.agentBusy ? "agent working" : dev.agentPolling ? "agent polling" : "agent offline";
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
          title="Send to agent"
          aria-label="Send to agent"
          disabled={openCount === 0}
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
          <SlideList slides={slides} current={frame.slide} perSlide={perSlide} onGoto={(i) => bridge.goto(i)} />
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
            <div className="lst-empty">{dev.loaded ? "Nothing saved yet. Mark a slide above to start." : "Loading"}</div>
          ) : (
            <EntryList entries={entries.slice(0, 30)} onDismiss={(id) => transport.setStatus(id, "dismissed").then(() => dev.refresh())} />
          )}
        </section>
      </div>

      <footer className="lst-footer">
        <button type="button" className="lst-btn" data-primary="true" disabled={openCount === 0} onClick={() => void send()}>
          Send to agent <Icon d={ICONS.send} />
        </button>
        <button type="button" className="lst-btn" disabled={!lastAppliedBatch} title="Revert the last applied batch" onClick={() => void revert()}>
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
  onGoto,
}: {
  slides: SlideInfo[];
  current: number;
  perSlide: Map<number, { open: number; applied: number }>;
  onGoto: (index: number) => void;
}) {
  return (
    <ol className="lst-slides">
      {slides.map((slide) => {
        const counts = perSlide.get(slide.index);
        const name = slide.sourceFile ? slide.sourceFile.split("/").pop()! : "";
        const isCurrent = slide.index === current;
        return (
          <li key={slide.index}>
            <button type="button" className="lst-slide" aria-current={isCurrent ? "true" : undefined} onClick={() => onGoto(slide.index)}>
              <span className="lst-slide-num">{slide.index + 1}</span>
              <span className="lst-slide-name">{name || <i>unresolved</i>}</span>
              <span className="lst-row">
                {counts?.open ? <span className="lst-badge" title={`${counts.open} open`}>{counts.open}</span> : null}
                {counts?.applied ? <span className="lst-badge" data-kind="applied" title={`${counts.applied} applied`}>{counts.applied}</span> : null}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function EntryList({ entries, onDismiss }: { entries: AnnotationEntry[]; onDismiss: (id: string) => void }) {
  return (
    <ul className="lst-entries">
      {entries.map((entry) => (
        <li key={entry.id} className="lst-entry" data-status={entry.status}>
          <div className="lst-meta">
            <span>
              slide {entry.slide.index + 1}
              {entry.slide.sourceFile ? `, ${entry.slide.sourceFile.split("/").pop()}` : ""}
            </span>
            <span className="lst-chip" data-s={entry.status}>
              {entry.status}
            </span>
            <button type="button" className="lst-x" title="Dismiss" aria-label="Dismiss annotation" onClick={() => onDismiss(entry.id)}>
              <Icon d={ICONS.close} />
            </button>
          </div>
          {entry.comments.length > 0 && <div className="lst-txt">{entry.comments.map((c) => c.text).join("\n")}</div>}
        </li>
      ))}
    </ul>
  );
}
