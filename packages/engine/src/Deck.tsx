import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { MDXProvider } from "@mdx-js/react";
import { mdxComponents } from "@liebstoeckel/components";
import * as Y from "yjs";
import type { PluginDef } from "@liebstoeckel/plugin-sdk";
import { useDeckNav, useTouchNav } from "./nav";
import { PortraitHint } from "./MobileHint";
import { useDeckSync } from "./useDeckSync";
import { useLive } from "./live/Plugin";
import { useLiveDeck } from "./live/deckIndex";
import { PersistentProvider, PersistentLayer, type PersistentItem } from "./PersistentLayer";
import { ScaledStage, SlideFrame } from "./Stage";
import { DeckThumb } from "./Thumb";
import { readThumbnails } from "./thumbnails";
import { hasEmbeddedSource } from "./source";
import { HelpOverlay } from "./HelpOverlay";
import { QrOverlay } from "./QrOverlay";
import { PluginOverlays } from "./live/globalChrome";
import { DeckChrome } from "./DeckChrome";
import { StepsProvider } from "./steps";
import { accumulateDigits, toggleFullscreen } from "./delivery";
import { normalizeSlides, type SlideInput } from "./slides";
import { resolveTransition, mobileTransitionsDisabled, type SlideDirection, type SlideTransition } from "./transitions";
import type { Theme } from "@liebstoeckel/theme";
import { useCoarsePointer } from "./useCoarsePointer";
import { moveSelection, gridCols, type GridDir } from "./overview";
import type { NavMode } from "./interaction";

export type DeckProps = {
  slides: SlideInput[];
  persistent?: PersistentItem[];
  brands?: string[];
  title?: string;
  /** Deck-wide default slide transition. A slide can override it with its own
   *  `export const transition`. Defaults to a light `"fade"`. */
  transition?: SlideTransition;
  /** Deck-defined brand themes. Each is injected as a `[data-brand]` CSS block, so a
   *  deck can ship its own brand(s) without editing the theme package, reference
   *  them by `name` in `brands`. (Built-in brand names work via the theme styles
   *  with no entry here.) */
  brandThemes?: Theme[];
  /** Allow slide transitions on mobile (coarse-pointer) devices. Off by default, *  transitions are dropped there for snappier, jank-free navigation. Set true to
   *  opt back in. */
  mobileTransitions?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins?: PluginDef<any>[];
};

function openPresenter() {
  // preserve the query (incl. ?t=<token>) so a live presenter window authenticates
  const url = location.origin + location.pathname + location.search + "#presenter";
  // window.open can throw (relay sandbox without allow-popups) or return null (a
  // popup blocker), never let that bubble up as an uncaught DOMException.
  try {
    const w = window.open(url, "liebstoeckel-presenter", "width=1366,height=860");
    if (!w) console.warn("[liebstoeckel] presenter pop-out was blocked (popup blocker or sandbox).");
  } catch (err) {
    console.warn("[liebstoeckel] presenter pop-out is unavailable in this context:", err);
  }
}

export function Deck({ slides, persistent = [], brands = ["default"], transition: deckTransition, mobileTransitions }: DeckProps) {
  const norm = useMemo(() => normalizeSlides(slides), [slides]);
  const count = norm.length;
  // Pre-rendered overview thumbnails (build-time), if the deck embedded them.
  const thumbs = useMemo(() => readThumbnails(), []);

  // Index/step source: shared Yjs doc in a live session (viewers follow), else
  // BroadcastChannel across local windows. Both hooks run; we select one.
  const liveCtx = useLive();
  const fallbackDoc = useMemo(() => new Y.Doc(), []);
  const sync = useDeckSync(count);
  const liveDeck = useLiveDeck(liveCtx?.doc ?? fallbackDoc, count, liveCtx?.role !== "viewer");
  const isLive = !!liveCtx?.live;
  const role = isLive ? liveCtx?.role : undefined;
  // A live viewer follows the presenter, overview + the presenter pop-out are
  // presenter-only (they'd reach the confidence monitor / drive nav). Standalone
  // (no live role) drives its own deck, so canDrive is true ((internal ADR)).
  const canDrive = role !== "viewer";
  const ctrl = isLive ? liveDeck : sync;
  const { index, step, total } = ctrl;

  // Gate total-reporting by the current slide so the *exiting* slide (during the
  // AnimatePresence overlap) can't clobber the entering slide's step count.
  const indexRef = useRef(index);
  indexRef.current = index;
  const onTotal = useCallback(
    (slideIndex: number, n: number) => {
      if (slideIndex === indexRef.current) ctrl.setTotal(n);
    },
    [ctrl],
  );

  const [brandIdx, setBrandIdx] = useState(0);
  const [help, setHelp] = useState(false);
  // Static for the loaded document; resolve once for the help overlay's eject hint.
  const ejectable = useMemo(() => hasEmbeddedSource(), []);
  const [blurred, setBlurred] = useState(false);
  const [overview, setOverview] = useState(false);
  const [qr, setQr] = useState(false);
  const [jump, setJump] = useState("");
  // Terminal "end of deck" screen: advancing past the final slide's last step shows
  // a deliberate end state (like PowerPoint) instead of replaying the last slide's
  // steps. Local to the driving window; cleared on any navigation away.
  const [ended, setEnded] = useState(false);
  // Keyboard selection within the overview grid (seeded to the current slide on open).
  const [sel, setSel] = useState(0);
  const brand = brands[brandIdx % brands.length];

  // The active interaction layer drives keyboard routing: a modal layer (overview,
  // end) owns its keys so deck nav never leaks through it.
  const mode: NavMode = overview ? "overview" : ended ? "end" : "slide";

  // Refs mirror the composing state so the keyboard handlers stay stable and never
  // read a stale closure when layers interact.
  const overviewRef = useRef(overview);
  overviewRef.current = overview;
  const selRef = useRef(sel);
  selRef.current = sel;
  const jumpRef = useRef(jump);
  jumpRef.current = jump;
  const stepRef = useRef(step);
  stepRef.current = step;
  const totalRef = useRef(total);
  totalRef.current = total;
  const selectedThumbRef = useRef<HTMLButtonElement | null>(null);
  // True while a Restart's masked crossfade-to-slide-1 is in flight (see onRestart).
  const pendingRestartRef = useRef(false);

  useEffect(() => {
    document.body.dataset.brand = brand;
  }, [brand]);

  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      e.preventDefault();
      setHelp((v) => !v);
    };
    window.addEventListener("contextmenu", onCtx);
    return () => window.removeEventListener("contextmenu", onCtx);
  }, []);

  // Overview open/close. Opening seeds the selection to the current slide and clears
  // the end state + jump buffer — the modal layers are mutually exclusive.
  const openOverview = useCallback(() => {
    setEnded(false);
    setJump("");
    setSel(indexRef.current);
    setOverview(true);
  }, []);
  const closeOverview = useCallback(() => {
    setOverview(false);
    setJump("");
  }, []);
  const toggleOverview = useCallback(() => {
    if (overviewRef.current) closeOverview();
    else openOverview();
  }, [openOverview, closeOverview]);

  // Numeric jump is layer-aware: in the overview it moves the live selection (the
  // grid IS the jump surface); otherwise it drives the floating HUD and commits.
  const onDigit = useCallback(
    (key: string) => {
      if (overviewRef.current) {
        const buffer = (jumpRef.current + key).slice(0, 3);
        setJump(buffer);
        const target = parseInt(buffer, 10) - 1;
        if (!Number.isNaN(target)) setSel(Math.min(Math.max(target, 0), Math.max(count - 1, 0)));
        return;
      }
      const r = accumulateDigits(jumpRef.current, key);
      setJump(r.buffer);
      if (r.commit != null) ctrl.setIndex(r.commit);
    },
    [count, ctrl],
  );

  // Overview keyboard: arrows move the selection, Enter opens it.
  const onGridMove = useCallback(
    (dir: GridDir) => {
      setJump("");
      const width = typeof window === "undefined" ? 1280 : window.innerWidth;
      setSel((s) => moveSelection(s, count, gridCols(width), dir));
    },
    [count],
  );
  const onSelect = useCallback(() => {
    ctrl.setIndex(selRef.current);
    closeOverview();
  }, [ctrl, closeOverview]);
  // Esc / back: close the overview, otherwise leave the end screen.
  const onExitModal = useCallback(() => {
    if (overviewRef.current) closeOverview();
    else setEnded(false);
  }, [closeOverview]);
  const onRestart = useCallback(() => {
    // Restart to slide 1 without the last slide flashing into view. The end card is
    // an opaque full-screen layer, so we keep it up (do NOT clear `ended`) while the
    // slide layer crossfades to slide 1 *behind* it — masked — and drop the card only
    // once that exit completes (AnimatePresence onExitComplete). `pendingRestartRef`
    // makes the index-change effect skip its usual end-clear during that window.
    if (indexRef.current === 0) {
      setEnded(false); // already on slide 1 — nothing to mask
      return;
    }
    pendingRestartRef.current = true;
    ctrl.setIndex(0);
    // Safety net: if onExitComplete never fires (interrupted animation), reveal anyway.
    window.setTimeout(() => {
      if (pendingRestartRef.current) {
        pendingRestartRef.current = false;
        setEnded(false);
      }
    }, 700);
  }, [ctrl]);

  // Advancing past the last slide's final step enters the end screen rather than
  // calling ctrl.next (which would reset the last slide's step to 0 and replay it).
  // Only the deck's driver gets it; a live viewer just follows. In a modal layer
  // routeKey never yields "next", so this only fires while actually presenting.
  const handleNext = useCallback(() => {
    if (canDrive && indexRef.current >= count - 1 && stepRef.current >= totalRef.current) {
      setEnded(true);
      return;
    }
    ctrl.next();
  }, [canDrive, count, ctrl]);
  const handlePrev = useCallback(() => ctrl.prev(), [ctrl]);
  // A jump elsewhere (overview select, numeric commit) clears the end state — except
  // during a Restart, where the end card intentionally stays up to mask the crossfade.
  useEffect(() => {
    if (!pendingRestartRef.current) setEnded(false);
  }, [index]);

  useDeckNav({
    count,
    setIndex: ctrl.setIndex,
    mode,
    onNext: handleNext,
    onPrev: handlePrev,
    onToggleBrand: brands.length > 1 ? () => setBrandIdx((n) => n + 1) : undefined,
    onOpenPresenter: canDrive ? openPresenter : undefined,
    onToggleHelp: () => setHelp((v) => !v),
    onFullscreen: () => void toggleFullscreen(document.documentElement),
    onBlur: () => setBlurred((v) => !v),
    onOverview: canDrive ? toggleOverview : undefined,
    onQr: () => setQr((v) => !v),
    onDigit,
    onGridMove,
    onSelect,
    onExitModal,
    onRestart,
  });

  // Touch nav drives the deck only while presenting — suppressed under any modal
  // layer so a swipe can't move the slide behind the overview / end screen.
  useTouchNav({ enabled: role !== "viewer" && !overview && !ended, onNext: handleNext, onPrev: handlePrev });

  const Current = norm[index]?.Component ?? (() => null);

  // Slide transition: per-slide `transition` export wins over the deck default
  // (which defaults to "fade"). `direction` mirrors directional presets on
  // back-nav; reduced-motion collapses everything to a tiny opacity fade.
  const reduceMotion = useReducedMotion();
  const coarse = useCoarsePointer();
  const prevIndexRef = useRef(index);
  const direction: SlideDirection = index >= prevIndexRef.current ? 1 : -1;
  useEffect(() => {
    prevIndexRef.current = index;
  }, [index]);
  // Mobile (coarse pointer) drops transitions by default, opt back in with
  // `mobileTransitions`. Otherwise: per-slide override → deck default → "fade".
  const requested = mobileTransitionsDisabled(coarse, mobileTransitions)
    ? "none"
    : (norm[index]?.transition ?? deckTransition);
  const slideTransition = resolveTransition(requested, !!reduceMotion);

  // Keep the keyboard-selected overview thumbnail in view as you arrow through a
  // long deck.
  useEffect(() => {
    if (overview) selectedThumbRef.current?.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
  }, [sel, overview, reduceMotion]);

  return (
    <MDXProvider components={mdxComponents}>
      <PersistentProvider>
       {/* 100dvh (dynamic viewport), NOT 100vh: on mobile the browser's address
           bar makes 100vh taller than the visible area, which would push the slide
           bottom + the viewport-pinned chrome below the fold. */}
       <div className="relative h-dvh w-screen overflow-hidden bg-bg">
        <ScaledStage className="absolute inset-0">
          <div data-deck-root className="absolute inset-0">
            <AnimatePresence
              custom={direction}
              onExitComplete={() => {
                // Restart kept the end card up to mask the crossfade to slide 1; the
                // exiting last slide is now gone, so it's safe to drop the card.
                if (pendingRestartRef.current) {
                  pendingRestartRef.current = false;
                  setEnded(false);
                }
              }}
            >
              <motion.div
                key={index}
                custom={direction}
                className="absolute inset-0"
                variants={slideTransition.variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={slideTransition.transition}
              >
                <SlideFrame>
                  <StepsProvider step={step} slideIndex={index} onTotal={onTotal}>
                    <Current />
                  </StepsProvider>
                </SlideFrame>
              </motion.div>
            </AnimatePresence>

            <PersistentLayer items={persistent} currentIndex={index} />

            {/* deck-wide plugin overlays (e.g. reactions floaters), over the
                slide, below chrome; non-interactive (live only, see (internal ADR)) */}
            <PluginOverlays />

            <HelpOverlay open={help} onClose={() => setHelp(false)} showBrand={brands.length > 1} role={role} ejectable={ejectable} />
            <PortraitHint />
          </div>

          {/* blur-screen overlay */}
          <AnimatePresence>
            {blurred && (
              <motion.div
                className="absolute inset-0 flex items-center justify-center backdrop-blur-2xl"
                style={{ background: "color-mix(in srgb, var(--brand-bg) 55%, transparent)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setBlurred(false)}
              >
                <svg width="84" height="84" viewBox="0 0 24 24" fill="none" stroke="var(--brand-muted)" strokeWidth="1.4" opacity="0.5">
                  <path d="M2 12s3.5-6 10-6 10 6 10 6" strokeLinecap="round" />
                  <path d="M2 12s3.5 4 10 4 10-4 10-4" strokeLinecap="round" />
                </svg>
              </motion.div>
            )}
          </AnimatePresence>
        </ScaledStage>

        {/* QR + overview render OUTSIDE the scaled canvas (device scale) so they're
            full-size on a phone, the touch ⋮ menu opens them. */}
        <QrOverlay open={qr} url={liveCtx?.viewerUrl} onClose={() => setQr(false)} />
        <AnimatePresence>
          {overview && (
            <motion.div
              className="absolute inset-0 z-40 overflow-auto bg-bg/95 p-[4%] backdrop-blur-xl"
              // Mount already opaque (no fade-in): opening from the end screen, the
              // overview must cover the last slide *immediately* while the end card
              // fades out on top, otherwise the slide flashes through the gap.
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduceMotion ? { duration: 0 } : undefined}
            >
              <div className="mb-6 flex items-baseline justify-between gap-4">
                <div className="font-mono text-sm uppercase tracking-[0.3em] text-muted">
                  Overview · ←↑↓→ move · Enter open · or type a number
                </div>
                {jump && <div className="font-mono text-sm text-text">→ {jump}</div>}
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-5">
                {norm.map((s, i) => (
                  <button
                    key={i}
                    ref={i === sel ? selectedThumbRef : undefined}
                    onClick={() => {
                      ctrl.setIndex(i);
                      closeOverview();
                    }}
                    aria-current={i === index ? "true" : undefined}
                    className={`relative aspect-video overflow-hidden rounded-xl border text-left outline-none transition ${
                      i === sel
                        ? "border-primary ring-2 ring-primary"
                        : i === index
                          ? "border-primary"
                          : "border-border hover:border-text"
                    }`}
                  >
                    <DeckThumb Component={s.Component} src={thumbs?.get(i)} alt={`Slide ${i + 1}`} />
                    <span className="absolute bottom-1 right-2 font-mono text-xs text-muted">{i + 1}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* terminal end-of-deck card (advancing past the last slide) — a calm,
            deliberate stop, NOT a wrap; covers the slide + ambient motion. Tapping the
            backdrop goes back; the action row offers Back / Overview / Restart. */}
        <AnimatePresence>
          {ended && (
            <motion.div
              className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-bg text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.3 }}
              onClick={() => setEnded(false)}
            >
              <div className="space-y-2">
                <div className="font-mono text-sm uppercase tracking-[0.3em] text-muted">End of deck</div>
                <div className="font-mono text-xs text-muted/60">{count} {count === 1 ? "slide" : "slides"}</div>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => setEnded(false)} className="rounded-lg border border-border px-4 py-2 font-mono text-sm text-text transition hover:border-text">← Back</button>
                <button onClick={openOverview} className="rounded-lg border border-border px-4 py-2 font-mono text-sm text-text transition hover:border-text">Overview</button>
                <button onClick={onRestart} className="rounded-lg border border-border px-4 py-2 font-mono text-sm text-text transition hover:border-text">↺ Restart</button>
              </div>
              <div className="font-mono text-[0.7rem] text-muted/50">← back · O overview · R restart · type a number to jump</div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* numeric-jump HUD — a single top layer above EVERY overlay (device scale), so
            typing a number reads correctly in slide and end modes. In the overview the
            buffer renders in its header instead (the grid is the jump surface). */}
        <AnimatePresence>
          {jump && !overview && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute left-1/2 top-8 z-[60] -translate-x-1/2 rounded-xl border border-border bg-surface/80 px-5 py-2 font-mono text-2xl text-text backdrop-blur"
            >
              → {jump}
            </motion.div>
          )}
        </AnimatePresence>

        {/* chrome at DEVICE scale, pinned to the real viewport (outside the scaled
            canvas) so the help + plugin buttons stay tappable on a phone. On touch
            the help affordance becomes a ⋮ action menu (fullscreen, overview, …). */}
        <DeckChrome
          index={index}
          count={count}
          isLive={isLive}
          role={role}
          canDrive={canDrive}
          viewerUrl={liveCtx?.viewerUrl}
          onHelp={() => setHelp(true)}
          onOverview={toggleOverview}
          onQr={() => setQr((v) => !v)}
        />
       </div>
      </PersistentProvider>
    </MDXProvider>
  );
}
