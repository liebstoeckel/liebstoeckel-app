import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MDXProvider } from "@mdx-js/react";
import { mdxComponents } from "@present-it/components";
import * as Y from "yjs";
import type { PluginDef } from "@present-it/plugin-sdk";
import { useDeckNav } from "./nav";
import { useDeckSync } from "./useDeckSync";
import { useLive } from "./live/Plugin";
import { useLiveDeck } from "./live/deckIndex";
import { PersistentProvider, PersistentLayer, type PersistentItem } from "./PersistentLayer";
import { ScaledStage, SlideFrame } from "./Stage";
import { DeckThumb } from "./Thumb";
import { readThumbnails } from "./thumbnails";
import { HelpOverlay } from "./HelpOverlay";
import { QrOverlay } from "./QrOverlay";
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
  window.open(url, "present-it-presenter", "width=1366,height=860");
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

  const Current = norm[index]?.Component ?? (() => null);

  return (
    <MDXProvider components={mdxComponents}>
      <PersistentProvider>
        <ScaledStage className="h-screen w-screen">
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

            {/* progress + counter */}
            <div className="absolute inset-x-0 bottom-0 h-[3px] bg-border/40">
              <motion.div
                className="h-full bg-primary"
                animate={{ width: `${((index + 1) / count) * 100}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 22 }}
              />
            </div>
            <div className="absolute bottom-5 right-8 font-mono text-sm tracking-wide text-muted">
              {String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
            </div>

            {/* role-aware help affordance: ? (standalone) · eye (viewer) · screen (presenter) */}
            <button
              onClick={() => setHelp(true)}
              title={
                isLive
                  ? `${role} · shortcuts (? or right-click)`
                  : "Shortcuts (? or right-click)"
              }
              className={`absolute bottom-4 left-8 flex h-7 w-7 items-center justify-center rounded-full border transition ${
                isLive
                  ? "border-accent/50 text-accent opacity-80 hover:opacity-100"
                  : "border-border text-muted/50 opacity-60 hover:border-text hover:text-text hover:opacity-100"
              }`}
            >
              {!isLive ? (
                <span className="font-mono text-xs">?</span>
              ) : role === "viewer" ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="13" rx="1.5" />
                  <path d="M12 17v3M8.5 20h7" />
                </svg>
              )}
            </button>

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
            <QrOverlay open={qr} url={liveCtx?.viewerUrl} onClose={() => setQr(false)} />
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

          {/* overview grid */}
          <AnimatePresence>
            {overview && (
              <motion.div
                className="absolute inset-0 overflow-auto bg-bg/95 p-[4%] backdrop-blur-xl"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="mb-6 font-mono text-sm uppercase tracking-[0.3em] text-muted">Overview · click or type a number</div>
                <div className="grid grid-cols-4 gap-5">
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
        </ScaledStage>
      </PersistentProvider>
    </MDXProvider>
  );
}
