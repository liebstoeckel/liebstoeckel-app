import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import * as Y from "yjs";
import { MDXProvider } from "@mdx-js/react";
import { mdxComponents } from "@liebstoeckel/components";
import { useDeckSync } from "./useDeckSync";
import { useDeckNav, useTouchNav } from "./nav";
import { useLive } from "./live/Plugin";
import { BreakoutAllowedContext } from "./live/breakout";
import { useLiveDeck } from "./live/deckIndex";
import { ScaledStage, SlideFrame } from "./Stage";
import { PresenterShare } from "./QrOverlay";
import { PersistentProvider } from "./PersistentLayer";
import { normalizeSlides } from "./slides";
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
// decides the size, so previews shrink to fit available height (never push the
// notes off-screen). Rendered live (not a thumbnail) — the presenter's current/next
// previews are only two slides, so this stays cheap while staying pixel-crisp and
// reflecting live plugin state, unlike the static build-time thumbnails.
function Thumb({ Component }: { Component?: ComponentType }) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-border bg-bg shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]">
      <MDXProvider components={mdxComponents}>
        <PersistentProvider>
          <BreakoutAllowedContext.Provider value={false}>
            <ScaledStage className="absolute inset-0">
              <SlideFrame still>{Component ? <Component /> : null}</SlideFrame>
            </ScaledStage>
          </BreakoutAllowedContext.Provider>
        </PersistentProvider>
      </MDXProvider>
    </div>
  );
}

// Prominent step/reveal progress, readable from a distance. Makes it obvious why
// the slide isn't advancing yet: there are still reveals left on this slide.
function StepIndicator({ step, total }: { step: number; total: number }) {
  const revealing = step < total;
  const remaining = total - step;
  return (
    <div
      className={`flex shrink-0 flex-col gap-2 rounded-xl border px-4 py-3 transition-colors ${
        revealing ? "border-accent/60 bg-accent/10" : "border-border bg-surface/30"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={`flex items-center gap-2 font-mono text-sm font-semibold uppercase tracking-[0.18em] ${
            revealing ? "text-accent" : "text-muted"
          }`}
        >
          {revealing && <span className="h-2 w-2 animate-pulse rounded-full bg-accent shadow-[0_0_8px_var(--brand-accent)]" />}
          {revealing ? "Revealing steps" : "All steps shown"}
        </span>
        <span className="font-mono text-2xl font-semibold tabular-nums text-text">
          {step}
          <span className="text-muted">/{total}</span>
        </span>
      </div>
      {/* segmented bar — one segment per step, filled up to the current reveal */}
      <div className="flex gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`h-2.5 flex-1 rounded-full transition-colors ${i < step ? "bg-accent" : "bg-border"}`}
          />
        ))}
      </div>
      <span className="font-mono text-xs tracking-wide text-muted">
        {revealing
          ? `${remaining} more ${remaining === 1 ? "reveal" : "reveals"} — then Next advances the slide`
          : "Next advances to the following slide"}
      </span>
    </div>
  );
}

export function PresenterView({ slides, brands = ["default"], title = "liebstoeckel" }: DeckProps) {
  const norm = useMemo(() => normalizeSlides(slides), [slides]);
  // Same controller selection as the Deck: shared doc when live, else BroadcastChannel.
  const liveCtx = useLive();
  const live = !!liveCtx?.live;
  const fallbackDoc = useMemo(() => new Y.Doc(), []);
  const sync = useDeckSync(norm.length);
  const liveDeck = useLiveDeck(liveCtx?.doc ?? fallbackDoc, norm.length, liveCtx?.role !== "viewer");
  const ctrl = live ? liveDeck : sync;
  const { index, step, total, setIndex, next, prev } = ctrl;

  // Share both links (Q / the header button), live only. The viewer link is
  // injected; the presenter link is this window's own URL minus the #presenter
  // hash (it loaded with ?t=<presenterToken>) — scanning it drives from a phone.
  const [share, setShare] = useState(false);
  const presenterUrl = useMemo(
    () => (typeof location !== "undefined" ? location.origin + location.pathname + location.search : undefined),
    [],
  );
  useDeckNav({ count: norm.length, setIndex, onNext: next, onPrev: prev, onQr: live ? () => setShare((v) => !v) : undefined });
  useTouchNav({ enabled: true, onNext: next, onPrev: prev });
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
      <header className="flex items-center justify-between border-b border-border px-4 py-3 lg:px-8 lg:py-4">
        <div className="flex items-baseline gap-3">
          <span className="font-heading text-xl font-semibold tracking-tight text-text lg:text-2xl">{title}</span>
          <span className="hidden font-mono text-[11px] uppercase tracking-[0.3em] text-muted sm:inline">presenter</span>
        </div>
        <div className="flex items-center gap-4 lg:gap-8">
          <div className="hidden text-right sm:block">
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted">clock</div>
            <div className="font-mono text-lg tabular-nums text-text">{wall}</div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted">elapsed</div>
            <div className="font-mono text-2xl font-medium tabular-nums text-primary lg:text-3xl">{fmtElapsed(now - startedAt)}</div>
          </div>
          <button
            onClick={resetTimer}
            className="rounded-lg border border-border px-3 py-2 font-mono text-xs uppercase tracking-wider text-muted transition hover:border-primary hover:text-primary"
          >
            reset
          </button>
          {live && (
            <button
              onClick={() => setShare((v) => !v)}
              title="Share links (Q) — viewer + presenter QR"
              aria-label="Share session links"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted transition hover:border-accent hover:text-accent"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <path d="M14 14h3M20 14v3M14 20h3M20 20h.01M17 17v.01" />
              </svg>
            </button>
          )}
        </div>
      </header>

      <PresenterShare open={share} viewerUrl={liveCtx?.viewerUrl} presenterUrl={presenterUrl} onClose={() => setShare(false)} />

      {/* main: flex row; each column is a min-h-0 flex-col so inner regions can
          shrink. Thumbnails get capped/flexible heights; the notes panel always
          keeps a guaranteed, scrollable minimum. */}
      <div className="flex min-h-0 flex-1 flex-col gap-5 p-5 lg:flex-row lg:gap-7 lg:p-7">
        {/* current */}
        <section className="flex min-h-0 min-w-0 flex-col gap-3 lg:flex-[1.55]">
          <Label dot>
            On screen · {String(index + 1).padStart(2, "0")} / {String(norm.length).padStart(2, "0")}
          </Label>
          <div className="h-[30vh] min-h-0 min-w-0 lg:h-auto lg:flex-1">
            <Thumb Component={Current} />
          </div>
          {total > 0 && <StepIndicator step={step} total={total} />}
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
              {step < total ? "Reveal →" : "Next →"}
            </button>
          </div>
        </section>

        {/* next + notes */}
        <aside className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          {/* next preview hidden on phones to give notes the room. The height
              share (basis) sits on THIS wrapper — a flex child of the aside, which
              has a definite height — so the inner preview can be flex-1 and fill it.
              (A % basis on an auto-height parent doesn't resolve, which collapsed
              the box to its min-height and made the preview render tiny.) */}
          <div className="hidden min-h-[120px] shrink basis-[34%] flex-col gap-3 lg:flex">
            <Label>{Next ? "Next up" : "End of deck"}</Label>
            <div className="min-h-0 min-w-0 flex-1 opacity-80">
              {Next ? <Thumb Component={Next} /> : <div className="h-full w-full rounded-2xl border border-dashed border-border" />}
            </div>
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
