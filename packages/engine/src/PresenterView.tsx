import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import * as Y from "yjs";
import { MDXProvider } from "@mdx-js/react";
import { mdxComponents } from "@present-it/components";
import { useDeckSync } from "./useDeckSync";
import { useDeckNav } from "./nav";
import { useLive } from "./live/Plugin";
import { useLiveDeck } from "./live/deckIndex";
import { ScaledStage, SlideFrame } from "./Stage";
import { PersistentProvider } from "./PersistentLayer";
import { normalizeSlides } from "./slides";
import { readThumbnails } from "./thumbnails";
import type { DeckProps } from "./Deck";

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const fmtElapsed = (delta: number) => {
  const s = Math.max(0, Math.floor(delta / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function Label({ children, dot }: { children: ReactNode; dot?: boolean }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.3em] text-muted">
      {dot && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary shadow-[0_0_8px_var(--brand-primary)]" />}
      {children}
    </div>
  );
}

// Fills its parent box; ScaledStage letterboxes the 16:9 slide inside. The PARENT
// decides the size, so thumbnails shrink to fit available height (never push the
// notes off-screen).
function Thumb({ Component, src }: { Component?: ComponentType; src?: string }) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-border bg-bg shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]">
      {src ? (
        <img src={src} alt="" loading="lazy" decoding="async" draggable={false} className="h-full w-full object-cover" />
      ) : (
        <MDXProvider components={mdxComponents}>
          <PersistentProvider>
            <ScaledStage className="absolute inset-0">
              <SlideFrame still>{Component ? <Component /> : null}</SlideFrame>
            </ScaledStage>
          </PersistentProvider>
        </MDXProvider>
      )}
    </div>
  );
}

export function PresenterView({ slides, brands = ["default"], title = "present-it" }: DeckProps) {
  const norm = useMemo(() => normalizeSlides(slides), [slides]);
  const thumbs = useMemo(() => readThumbnails(), []);
  // Same controller selection as the Deck: shared doc when live, else BroadcastChannel.
  const liveCtx = useLive();
  const live = !!liveCtx?.live;
  const fallbackDoc = useMemo(() => new Y.Doc(), []);
  const sync = useDeckSync(norm.length);
  const liveDeck = useLiveDeck(liveCtx?.doc ?? fallbackDoc, norm.length, liveCtx?.role !== "viewer");
  const ctrl = live ? liveDeck : sync;
  const { index, step, total, setIndex, next, prev } = ctrl;
  useDeckNav({ count: norm.length, setIndex, onNext: next, onPrev: prev });
  const now = useNow();
  // the presenter's own elapsed timer (per-window)
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const resetTimer = () => setStartedAt(Date.now());

  useEffect(() => {
    document.body.dataset.brand = brands[0];
  }, [brands]);

  const Current = norm[index]?.Component;
  const Next = norm[index + 1]?.Component;
  const notes = norm[index]?.notes;
  const wall = new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex h-screen w-screen flex-col bg-bg font-body text-text">
      {/* top bar */}
      <header className="flex items-center justify-between border-b border-border px-8 py-4">
        <div className="flex items-baseline gap-3">
          <span className="font-heading text-2xl font-semibold tracking-tight text-text">{title}</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted">presenter</span>
        </div>
        <div className="flex items-center gap-8">
          <div className="text-right">
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted">clock</div>
            <div className="font-mono text-lg tabular-nums text-text">{wall}</div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted">elapsed</div>
            <div className="font-mono text-3xl font-medium tabular-nums text-primary">{fmtElapsed(now - startedAt)}</div>
          </div>
          <button
            onClick={resetTimer}
            className="rounded-lg border border-border px-3 py-2 font-mono text-xs uppercase tracking-wider text-muted transition hover:border-primary hover:text-primary"
          >
            reset
          </button>
        </div>
      </header>

      {/* main: flex row; each column is a min-h-0 flex-col so inner regions can
          shrink. Thumbnails get capped/flexible heights; the notes panel always
          keeps a guaranteed, scrollable minimum. */}
      <div className="flex min-h-0 flex-1 gap-7 p-7">
        {/* current */}
        <section className="flex min-h-0 min-w-0 flex-[1.55] flex-col gap-3">
          <Label dot>
            On screen · {String(index + 1).padStart(2, "0")} / {String(norm.length).padStart(2, "0")}
            {total > 0 ? ` · step ${step}/${total}` : ""}
          </Label>
          <div className="min-h-0 min-w-0 flex-1">
            <Thumb Component={Current} src={thumbs?.get(index)} />
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              onClick={prev}
              className="flex-1 rounded-xl border border-border py-3 font-mono text-sm uppercase tracking-widest text-muted transition hover:border-text hover:text-text"
            >
              ← Prev
            </button>
            <button
              onClick={next}
              className="flex-[2] rounded-xl bg-primary py-3 font-mono text-sm font-semibold uppercase tracking-widest text-on-primary transition hover:brightness-110"
            >
              Next →
            </button>
          </div>
        </section>

        {/* next + notes */}
        <aside className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <Label>{Next ? "Next up" : "End of deck"}</Label>
          {/* next preview: shrinkable, capped so it can't crowd out the notes */}
          <div className="min-h-[64px] min-w-0 shrink basis-[34%] opacity-80">
            {Next ? <Thumb Component={Next} src={thumbs?.get(index + 1)} /> : <div className="h-full w-full rounded-2xl border border-dashed border-border" />}
          </div>

          <Label>Speaker notes</Label>
          {/* notes always visible: takes remaining space, with a floor, scrolls if needed */}
          <div className="presenter-notes min-h-[38%] min-w-0 flex-1 overflow-auto rounded-2xl border border-border bg-surface/40 p-6 text-xl leading-relaxed text-text/90">
            {notes ?? <span className="text-muted">— no notes for this slide —</span>}
          </div>
        </aside>
      </div>
    </div>
  );
}
