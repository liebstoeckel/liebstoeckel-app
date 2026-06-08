import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import * as Y from "yjs";
import { MDXProvider } from "@mdx-js/react";
import { mdxComponents } from "@liebstoeckel/components";
import { useDeckSync } from "./useDeckSync";
import { useDeckNav, useTouchNav } from "./nav";
import { useLive } from "./live/Plugin";
import { PresenterPanel } from "./live/presenterPanel";
import { BreakoutAllowedContext } from "./live/breakout";
import { useLiveDeck } from "./live/deckIndex";
import { ScaledStage, SlideFrame } from "./Stage";
import { PresenterShare } from "./QrOverlay";
import { PersistentProvider } from "./PersistentLayer";
import { useCoarsePointer } from "./useCoarsePointer";
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

type WakeLockNav = Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } };

/** Hold a screen Wake Lock while `on` — a phone used as a remote shouldn't sleep
 *  mid-talk. Best-effort (browser/permission dependent); re-acquires when the tab
 *  returns to the foreground (locks drop on hide). */
function useWakeLock(on: boolean) {
  useEffect(() => {
    const nav = typeof navigator !== "undefined" ? (navigator as WakeLockNav) : undefined;
    if (!on || !nav?.wakeLock) return;
    let sentinel: { release(): Promise<void> } | null = null;
    let cancelled = false;
    const acquire = () =>
      nav
        .wakeLock!.request("screen")
        .then((s) => {
          if (cancelled) void s.release().catch(() => {});
          else sentinel = s;
        })
        .catch(() => {});
    void acquire();
    const onVis = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      void sentinel?.release().catch(() => {});
    };
  }, [on]);
}

const fmtElapsed = (delta: number) => {
  const s = Math.max(0, Math.floor(delta / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

type TimerCell = { at: number; epoch: number };

/** The shared talk-timer start, the **conflict-free** way ((internal ADR)): each presenter
 *  writes its OWN cell (keyed by `doc.clientID`) so two clients never contend for one
 *  key — no LWW tie-break, no timing race. The start is a deterministic reduce over
 *  the map: the MIN `at` within the highest `epoch`. Reset bumps the epoch (a higher
 *  epoch wins), so it propagates to every device. Each device computes elapsed itself
 *  (sub-second clock skew). Only drivers write; standalone → per-window fallback doc. */
function usePresenterStart(doc: Y.Doc, canWrite: boolean): { startedAt: number; reset: () => void } {
  const map = useMemo(() => doc.getMap("timer") as Y.Map<TimerCell>, [doc]);
  const key = String(doc.clientID);

  const reduce = useCallback((): { start?: number; epoch: number } => {
    let epoch = -1;
    let start: number | undefined;
    map.forEach((v) => {
      if (!v || typeof v.at !== "number") return;
      const e = typeof v.epoch === "number" ? v.epoch : 0;
      if (e > epoch) {
        epoch = e;
        start = v.at;
      } else if (e === epoch && v.at < (start ?? Infinity)) {
        start = v.at;
      }
    });
    return { start, epoch: Math.max(0, epoch) };
  }, [map]);

  const [startedAt, setStartedAt] = useState<number | undefined>(() => reduce().start);

  useEffect(() => {
    const apply = () => setStartedAt(reduce().start);
    map.observe(apply);
    apply();
    // claim our own cell at the current epoch — only we ever write this key
    if (canWrite && !map.has(key)) map.set(key, { at: Date.now(), epoch: reduce().epoch });
    return () => map.unobserve(apply);
  }, [map, key, canWrite, reduce]);

  const reset = useCallback(() => {
    if (canWrite) map.set(key, { at: Date.now(), epoch: reduce().epoch + 1 });
  }, [map, key, canWrite, reduce]);

  return { startedAt: startedAt ?? Date.now(), reset };
}

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
function Thumb({ Component, interactive = true }: { Component?: ComponentType; interactive?: boolean }) {
  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded-2xl border border-border bg-bg shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] ${interactive ? "" : "pointer-events-none"}`}
    >
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
  // Talk timer: the START is shared via the doc (conflict-free per-client cells,
  // (internal ADR)) so every presenter surface agrees; standalone falls back to the
  // per-window doc. Only drivers write.
  const timerDoc = liveCtx?.doc ?? fallbackDoc;
  const canWriteTimer = !live || liveCtx?.role !== "viewer";
  const { startedAt, reset: resetTimer } = usePresenterStart(timerDoc, canWriteTimer);

  // Phone presenter ((internal ADR)): a notes-first confidence monitor + remote. Keep the
  // screen awake, and offer a way back to the audience deck (drop the #presenter
  // hash → Present re-selects the Deck at mount).
  const coarse = useCoarsePointer();
  useWakeLock(coarse);
  const backToSlides = () => {
    if (typeof location !== "undefined") location.assign(location.pathname + location.search);
  };

  // Focus mode ((internal ADR)): full-bleed the active pane (notes / a plugin console),
  // hiding the slide previews. Nav + timer + the tab strip stay pinned. `z` toggles,
  // `Esc` restores; both guard against firing while typing in a console input.
  const [focused, setFocused] = useState(false);
  const toggleFocus = useCallback(() => setFocused((v) => !v), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const editable = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (e.key === "Escape" && focused) {
        setFocused(false);
        return;
      }
      if (e.key === "z" && !editable) {
        e.preventDefault();
        toggleFocus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused, toggleFocus]);

  useEffect(() => {
    document.body.dataset.brand = brands[0];
  }, [brands]);

  const Current = norm[index]?.Component;
  const Next = norm[index + 1]?.Component;
  const notes = norm[index]?.notes;
  const wall = new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const elapsed = fmtElapsed(now - startedAt);
  const count = norm.length;
  // Nothing left to advance to: last slide AND all reveals shown (a remaining reveal
  // still makes Next a "Reveal →"). Symmetric for Prev at the very start.
  const atEnd = index >= count - 1 && step >= total;
  const atStart = index <= 0 && step <= 0;
  const noNotes = <span className="text-muted">— no notes for this slide —</span>;
  const shareOverlay = (
    <PresenterShare open={share} viewerUrl={liveCtx?.viewerUrl} presenterUrl={presenterUrl} onClose={() => setShare(false)} />
  );

  // ── Mobile: notes-first stack ((internal ADR)) ───────────────────────────────────
  // Notes dominate; a compact next+reveal peek; big thumb-zone Prev/Next. Vertical
  // scroll moves the notes, horizontal swipe (useTouchNav) changes slides — the two
  // axes don't collide, so notes scroll can't misfire a slide change.
  if (coarse) {
    return (
      <div className="flex h-dvh w-screen flex-col bg-bg font-body text-text">
        {shareOverlay}
        {/* 1 · slim status bar */}
        <div
          className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2"
          style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top))" }}
        >
          <button onClick={backToSlides} aria-label="Back to slides" className="font-mono text-xs uppercase tracking-wider text-muted transition active:text-text">
            ‹ slides
          </button>
          <span className="font-mono text-sm tabular-nums text-text">
            {String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
          </span>
          <div className="flex items-center gap-3">
            <button onClick={resetTimer} aria-label="Reset timer" className="font-mono text-sm tabular-nums text-primary">
              {elapsed}
            </button>
            {live && (
              <button onClick={() => setShare((v) => !v)} aria-label="Share session links" className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition active:text-accent">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <path d="M14 14h3M20 14v3M14 20h3M20 20h.01M17 17v.01" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* 2 · dominant region: notes (default) + one tab per plugin console ((internal ADR)),
            with a maximize toggle ((internal ADR)) */}
        <PresenterPanel variant="mobile" notes={notes ?? noNotes} focused={focused} onToggleFocus={toggleFocus} />

        {/* 3 · compact next + reveal peek — reclaimed by focus mode */}
        {!focused && (
        <div className="flex shrink-0 items-center gap-3 border-t border-border px-4 py-2">
          <div className="h-12 w-[5.5rem] shrink-0 opacity-80">
            {Next ? <Thumb Component={Next} interactive={false} /> : <div className="h-full w-full rounded-md border border-dashed border-border" />}
          </div>
          <div className="min-w-0 flex-1 font-mono text-[11px]">
            <div className="uppercase tracking-[0.2em] text-muted">{Next ? "next up" : "end of deck"}</div>
            {total > 0 && (
              <div className={step < total ? "text-accent" : "text-muted"}>
                {step < total ? `revealing ${step} / ${total} — Next reveals` : "Next → following slide"}
              </div>
            )}
          </div>
        </div>
        )}

        {/* 4 · thumb-zone controls */}
        <div
          className="flex shrink-0 items-stretch gap-3 px-4 pt-2"
          style={{ paddingBottom: "calc(0.85rem + env(safe-area-inset-bottom))" }}
        >
          <button
            onClick={prev}
            disabled={atStart}
            aria-label="Previous"
            className="flex-1 rounded-xl border border-border py-4 font-mono text-lg text-muted transition active:border-text active:text-text disabled:opacity-40"
          >
            ←
          </button>
          <button
            onClick={next}
            disabled={atEnd}
            className="flex-[2.4] rounded-xl bg-primary py-4 font-mono text-base font-semibold uppercase tracking-widest text-on-primary transition active:brightness-110 disabled:opacity-40"
          >
            {step < total ? "Reveal →" : "Next →"}
          </button>
        </div>
      </div>
    );
  }

  // ── Desktop: two-column confidence monitor ──────────────────────────────────
  // Prev/Next, reused in the current column (normal) and pinned under the panel
  // (focus mode) so navigation is never hidden ((internal ADR)).
  const navRow = (
    <div className="flex shrink-0 items-center gap-3">
      <button
        onClick={prev}
        disabled={atStart}
        className="flex-1 rounded-xl border border-border py-3 font-mono text-sm uppercase tracking-widest text-muted transition hover:border-text hover:text-text disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted"
      >
        ← Prev
      </button>
      <button
        onClick={next}
        disabled={atEnd}
        className="flex-[2] rounded-xl bg-primary py-3 font-mono text-sm font-semibold uppercase tracking-widest text-on-primary transition hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100"
      >
        {step < total ? "Reveal →" : "Next →"}
      </button>
    </div>
  );
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

      {shareOverlay}

      {/* main: flex row; each column is a min-h-0 flex-col so inner regions can
          shrink. Thumbnails get capped/flexible heights; the notes panel always
          keeps a guaranteed, scrollable minimum. */}
      <div className="flex min-h-0 flex-1 flex-col gap-5 p-5 lg:flex-row lg:gap-7 lg:p-7">
        {/* current — hidden in focus mode (it's on the room's screen anyway) */}
        {!focused && (
          <section className="flex min-h-0 min-w-0 flex-col gap-3 lg:flex-[1.55]">
            <Label dot>
              On screen · {String(index + 1).padStart(2, "0")} / {String(norm.length).padStart(2, "0")}
            </Label>
            <div className="h-[30vh] min-h-0 min-w-0 lg:h-auto lg:flex-1">
              <Thumb Component={Current} />
            </div>
            {total > 0 && <StepIndicator step={step} total={total} />}
            {navRow}
          </section>
        )}

        {/* next + notes (full width in focus mode) */}
        <aside className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          {/* next preview hidden on phones to give notes the room, and in focus mode.
              The height share (basis) sits on THIS wrapper — a flex child of the aside,
              which has a definite height — so the inner preview can be flex-1 and fill
              it. (A % basis on an auto-height parent doesn't resolve, which collapsed
              the box to its min-height and made the preview render tiny.) */}
          {!focused && (
            <div className="hidden min-h-[120px] shrink basis-[34%] flex-col gap-3 lg:flex">
              <Label>{Next ? "Next up" : "End of deck"}</Label>
              <div className="min-h-0 min-w-0 flex-1 opacity-80">
                {Next ? <Thumb Component={Next} interactive={false} /> : <div className="h-full w-full rounded-2xl border border-dashed border-border" />}
              </div>
            </div>
          )}

          {/* notes (default tab) + one tab per plugin console ((internal ADR)), with the
              maximize toggle ((internal ADR)). */}
          <PresenterPanel variant="desktop" notes={notes ?? noNotes} focused={focused} onToggleFocus={toggleFocus} />
          {/* pin nav under the panel when the current column (which normally holds it)
              is hidden by focus mode */}
          {focused && navRow}
        </aside>
      </div>
    </div>
  );
}
