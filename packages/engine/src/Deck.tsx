import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
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
import { HelpOverlay } from "./HelpOverlay";
import { QrOverlay } from "./QrOverlay";
import { PluginOverlays } from "./live/globalChrome";
import { DeckChrome } from "./DeckChrome";
import { StepsProvider } from "./steps";
import { accumulateDigits, toggleFullscreen } from "./delivery";
import { normalizeSlides, type SlideInput } from "./slides";

export type DeckProps = {
  slides: SlideInput[];
  persistent?: PersistentItem[];
  brands?: string[];
  title?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins?: PluginDef<any>[];
};

function openPresenter() {
  // preserve the query (incl. ?t=<token>) so a live presenter window authenticates
  const url = location.origin + location.pathname + location.search + "#presenter";
  // window.open can throw (relay sandbox without allow-popups) or return null (a
  // popup blocker) — never let that bubble up as an uncaught DOMException.
  try {
    const w = window.open(url, "liebstoeckel-presenter", "width=1366,height=860");
    if (!w) console.warn("[liebstoeckel] presenter pop-out was blocked (popup blocker or sandbox).");
  } catch (err) {
    console.warn("[liebstoeckel] presenter pop-out is unavailable in this context:", err);
  }
}

export function Deck({ slides, persistent = [], brands = ["default"] }: DeckProps) {
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
  const [blurred, setBlurred] = useState(false);
  const [overview, setOverview] = useState(false);
  const [qr, setQr] = useState(false);
  const [jump, setJump] = useState("");
  const brand = brands[brandIdx % brands.length];

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

  const onDigit = useCallback(
    (key: string) => {
      const r = accumulateDigits(jump, key);
      setJump(r.buffer);
      if (r.commit != null) ctrl.setIndex(r.commit);
    },
    [jump, ctrl],
  );

  useDeckNav({
    count,
    setIndex: ctrl.setIndex,
    onNext: ctrl.next,
    onPrev: ctrl.prev,
    onToggleBrand: brands.length > 1 ? () => setBrandIdx((n) => n + 1) : undefined,
    onOpenPresenter: openPresenter,
    onToggleHelp: () => setHelp((v) => !v),
    onFullscreen: () => void toggleFullscreen(document.documentElement),
    onBlur: () => setBlurred((v) => !v),
    onOverview: () => setOverview((v) => !v),
    onQr: () => setQr((v) => !v),
    onDigit,
  });

  // Touch nav for everyone who drives their own deck (standalone + presenter); a
  // live viewer follows the presenter, so it isn't bound for them.
  useTouchNav({ enabled: role !== "viewer", onNext: ctrl.next, onPrev: ctrl.prev });

  const Current = norm[index]?.Component ?? (() => null);

  return (
    <MDXProvider components={mdxComponents}>
      <PersistentProvider>
       {/* 100dvh (dynamic viewport), NOT 100vh: on mobile the browser's address
           bar makes 100vh taller than the visible area, which would push the slide
           bottom + the viewport-pinned chrome below the fold. */}
       <div className="relative h-dvh w-screen overflow-hidden bg-bg">
        <ScaledStage className="absolute inset-0">
          <div data-deck-root className="absolute inset-0">
            <AnimatePresence>
              <motion.div
                key={index}
                className="absolute inset-0"
                initial={{ opacity: 0, filter: "blur(10px)", scale: 1.015 }}
                animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
                exit={{ opacity: 0, filter: "blur(10px)", scale: 0.99 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                <SlideFrame>
                  <StepsProvider step={step} slideIndex={index} onTotal={onTotal}>
                    <Current />
                  </StepsProvider>
                </SlideFrame>
              </motion.div>
            </AnimatePresence>

            <PersistentLayer items={persistent} />

            {/* deck-wide plugin overlays (e.g. reactions floaters) — over the
                slide, below chrome; non-interactive (live only, see ADR 0021) */}
            <PluginOverlays />

            {/* jump-to-number buffer */}
            <AnimatePresence>
              {jump && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute left-1/2 top-8 -translate-x-1/2 rounded-xl border border-border bg-surface/80 px-5 py-2 font-mono text-2xl text-text backdrop-blur"
                >
                  → {jump}
                </motion.div>
              )}
            </AnimatePresence>

            <HelpOverlay open={help} onClose={() => setHelp(false)} showBrand={brands.length > 1} role={role} />
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
            full-size on a phone — the touch ⋮ menu opens them. */}
        <QrOverlay open={qr} url={liveCtx?.viewerUrl} onClose={() => setQr(false)} />
        <AnimatePresence>
          {overview && (
            <motion.div
              className="absolute inset-0 z-40 overflow-auto bg-bg/95 p-[4%] backdrop-blur-xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="mb-6 font-mono text-sm uppercase tracking-[0.3em] text-muted">Overview · tap or type a number</div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-5">
                {norm.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      ctrl.setIndex(i);
                      setOverview(false);
                    }}
                    className={`relative aspect-video overflow-hidden rounded-xl border text-left transition ${
                      i === index ? "border-primary" : "border-border hover:border-text"
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

        {/* chrome at DEVICE scale, pinned to the real viewport (outside the scaled
            canvas) so the help + plugin buttons stay tappable on a phone. On touch
            the help affordance becomes a ⋮ action menu (fullscreen, overview, …). */}
        <DeckChrome
          index={index}
          count={count}
          isLive={isLive}
          role={role}
          canDrive={role !== "viewer"}
          brandCount={brands.length}
          viewerUrl={liveCtx?.viewerUrl}
          onHelp={() => setHelp(true)}
          onOverview={() => setOverview((v) => !v)}
          onQr={() => setQr((v) => !v)}
          onBrand={() => setBrandIdx((n) => n + 1)}
        />
       </div>
      </PersistentProvider>
    </MDXProvider>
  );
}
