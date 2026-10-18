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
import { linkWithToken } from "./live/links";
import { detectLive } from "./live/detect";
import { PersistentProvider, PersistentLayer, type PersistentItem } from "./PersistentLayer";
import { ScaledStage, SlideFrame } from "./Stage";
import { Backdrop, BackdropProvider, type BackdropComponent } from "./backdrop";
import { DeckThumb } from "./Thumb";
import { readThumbnails } from "./thumbnails";
import { hasEmbeddedSource } from "./source";
import { HelpOverlay } from "./HelpOverlay";
import { QrOverlay } from "./QrOverlay";
import { JoinCardPresence } from "./joinPresence";
import { shouldOpenJoinAtStart, START_HINT } from "./joinStart";
import { PluginOverlays } from "./live/globalChrome";
import { PhoneViewContext, usePhoneFirst, type PhoneView } from "./live/phoneView";
import { DeckChrome } from "./DeckChrome";
import { StepsProvider } from "./steps";
import { accumulateDigits, toggleFullscreen, resolveStep } from "./delivery";
import { normalizeSlides, type SlideInput } from "./slides";
import { resolveTransition, mobileTransitionsDisabled, type SlideDirection, type SlideTransition } from "./transitions";
import type { Theme } from "@liebstoeckel/theme";
import { useCoarsePointer } from "./useCoarsePointer";
import { moveSelection, gridCols, type GridDir } from "./overview";
import type { NavMode } from "./interaction";
import { LiveStatusBadge, ViewerStateCard } from "./live/status";
import { msgs } from "./live/messages";
import { useLegalLinks } from "./live/legal";
import { DEFAULT_BRANDS, warnIfBrandsMissing } from "./brandCheck";
import { useDialogFocus } from "./focus";

export type DeckProps = {
  slides: SlideInput[];
  persistent?: PersistentItem[];
  /** Brand names to theme the deck with; the first is active and `t` cycles
   *  through the rest. Defaults to the house brand, `["liebstoeckel"]`. */
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
  /** Deck-wide decoration behind the slide transition stack, rendered once per
   *  view. Omit for the default static Atmosphere, pass `null` for a flat
   *  background, or pass a component; it receives `still` on non-interactive
   *  surfaces (thumbnails, print, capture, presenter previews) and must render
   *  motionless there. */
  backdrop?: BackdropComponent | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins?: PluginDef<any>[];
};

/** This document's own URL. A deck inlined into an `about:srcdoc` frame (the MCP
 *  preview widget does this) has no usable `location`; the embedder points a `<base>`
 *  at the deck's real URL, which `document.baseURI` reflects. Everywhere else this is
 *  plain `location`. */
function pageHref(): string {
  return location.protocol === "about:" ? document.baseURI : location.href;
}

function openPresenter() {
  // A live presenter window signs in with the token this page was started with (the
  // address bar no longer carries it), minus this tab's participant id: the pop-out is
  // a participant of its own.
  const url = linkWithToken(pageHref(), detectLive()?.token) + "#presenter";
  // window.open can throw (relay sandbox without allow-popups) or return null (a
  // popup blocker), never let that bubble up as an uncaught DOMException.
  try {
    const w = window.open(url, "liebstoeckel-presenter", "width=1366,height=860");
    if (!w) console.warn("[liebstoeckel] presenter pop-out was blocked (popup blocker or sandbox).");
  } catch (err) {
    console.warn("[liebstoeckel] presenter pop-out is unavailable in this context:", err);
  }
}

/** Height of the slide strip above the phone-first panel: the slide at full width
 *  (16:9), but never more than about a quarter of the screen. */
const PHONE_STRIP = "min(56.25vw, 27dvh)";
const TEXT_ENTRY = "input, textarea, [contenteditable=true]";

export function Deck({ slides, persistent = [], brands = DEFAULT_BRANDS, brandThemes, transition: deckTransition, mobileTransitions, backdrop }: DeckProps) {
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
      // Carry the index this count describes: until the landed slide reports,
      // `total` still describes the one we left, and a STEP_ALL step must not be
      // resolved against it.
      if (slideIndex === indexRef.current) ctrl.setTotal(n, slideIndex);
    },
    [ctrl],
  );

  const [brandIdx, setBrandIdx] = useState(0);
  const [help, setHelp] = useState(false);
  // Static for the loaded document; resolve once for the help overlay's eject hint.
  const ejectable = useMemo(() => hasEmbeddedSource(), []);
  // The host's legal links (hosted live pages): in the menu for the audience; the
  // presenter's deck window is what the room sees, so it shows none.
  const legal = useLegalLinks();
  const pageRole = useMemo(() => detectLive()?.role, []);
  const menuLegal = (role ?? pageRole) === "presenter" ? null : legal;
  const [blurred, setBlurred] = useState(false);
  const [overview, setOverview] = useState(false);
  const [qr, setQrState] = useState(false);
  // The join overlay opened by itself at the start of a talk (its hint says how to go on).
  const [qrAuto, setQrAuto] = useState(false);
  const qrRef = useRef(qr);
  qrRef.current = qr;
  const setQr = useCallback((next: boolean | ((open: boolean) => boolean)) => {
    setQrAuto(false);
    setQrState(next);
  }, []);
  // How many `<JoinCard />`s are on screen: a slide that shows one needs no overlay.
  const joinCards = useRef(0);
  const registerJoinCard = useCallback(() => {
    joinCards.current++;
    return () => {
      joinCards.current--;
    };
  }, []);
  const [jump, setJump] = useState("");
  // Terminal "end of deck" screen: advancing past the final slide's last step shows
  // a deliberate end state (like PowerPoint) instead of replaying the last slide's
  // steps. It lives in shared state, so driving from the presenter window puts THIS
  // window into it too; the controllers clear it on any slide change.
  const ended = ctrl.ended;
  const setEnded = ctrl.setEnded;
  // Purely presentational, and deliberately NOT shared: Restart clears `ended` as it
  // moves to slide 1, so this keeps the opaque card painted over the crossfade in
  // the window that asked for it. See onRestart.
  const [mask, setMask] = useState(false);
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
  const overviewBoxRef = useRef<HTMLDivElement | null>(null);
  const endCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.body.dataset.brand = brand;
  }, [brand]);

  // Development only: report a brand name with no theme behind it (a typo, or a
  // custom brand missing from `brandThemes`) instead of rendering unthemed.
  const brandKey = [...brands, "", ...(brandThemes ?? []).map((t) => t.name)].join("\n");
  useEffect(() => {
    warnIfBrandsMissing(brands, brandThemes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandKey]);

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
  // Deliberately does NOT clear `ended`: that state is shared, and the overview is
  // a presenter-local layer, so browsing it would otherwise drop the audience out
  // of the end card and back onto the last slide. The end card is hidden locally
  // while the grid is open (the layers are mutually exclusive on screen) and the
  // deck only actually leaves the end state when a slide is selected, which clears
  // it through setIndex.
  const openOverview = useCallback(() => {
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
  }, [closeOverview, setEnded]);
  const onRestart = useCallback(() => {
    // Restart to slide 1 without the last slide flashing into view. The end card is
    // an opaque full-screen layer, so it stays painted while the slide layer
    // crossfades to slide 1 *behind* it, masked, and drops only once that exit
    // completes (AnimatePresence onExitComplete). Moving the index clears the shared
    // `ended`, so the mask is what holds the card up for the duration.
    if (indexRef.current === 0) {
      setEnded(false); // already on slide 1 — nothing to mask
      return;
    }
    setMask(true);
    ctrl.setIndex(0);
    // Safety net: if onExitComplete never fires (interrupted animation), reveal anyway.
    window.setTimeout(() => setMask(false), 700);
  }, [ctrl, setEnded]);

  // Advancing past the last slide's final step enters the end screen rather than
  // calling ctrl.next (which would reset the last slide's step to 0 and replay it).
  // Only the deck's driver gets it; a live viewer just follows. In a modal layer
  // routeKey never yields "next", so this only fires while actually presenting.
  const handleNext = useCallback(() => {
    // The join overlay is up: the first forward press only puts it away.
    if (qrRef.current) return setQr(false);
    const shown = resolveStep(stepRef.current, totalRef.current);
    if (canDrive && indexRef.current >= count - 1 && shown >= totalRef.current) {
      setEnded(true);
      return;
    }
    ctrl.next();
  }, [canDrive, count, ctrl, setQr]);
  const handlePrev = useCallback(() => (qrRef.current ? setQr(false) : ctrl.prev()), [ctrl, setQr]);

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

  // The phone-first audience view: on a viewer's portrait phone, an interactive plugin
  // on the current slide renders full width in a panel below a small slide preview
  // (its `<Plugin>` registers and portals there). Without one, the slide shows as usual.
  const phoneOn = usePhoneFirst(role) && isLive;
  const [phoneTarget, setPhoneTarget] = useState<HTMLDivElement | null>(null);
  const [phonePlugins, setPhonePlugins] = useState(0);
  const registerPhonePlugin = useCallback(() => {
    setPhonePlugins((n) => n + 1);
    return () => setPhonePlugins((n) => n - 1);
  }, []);
  const phoneView = useMemo<PhoneView | null>(
    () => (phoneOn ? { target: phoneTarget, register: registerPhonePlugin } : null),
    [phoneOn, phoneTarget, registerPhonePlugin],
  );
  const phoneLayout = phoneOn && phonePlugins > 0;
  // Typing a question: the panel takes the whole screen so the keyboard leaves room.
  const [phoneTyping, setPhoneTyping] = useState(false);
  useEffect(() => {
    if (!phoneLayout) setPhoneTyping(false);
  }, [phoneLayout]);
  // Native focus events: the plugins render into the panel through portals, so React's
  // own events bubble to the plugin's place in the slide, not to the panel.
  useEffect(() => {
    if (!phoneTarget) return;
    const typing = (el: EventTarget | null) => el instanceof HTMLElement && el.matches(TEXT_ENTRY);
    const onIn = (e: FocusEvent) => {
      if (typing(e.target)) setPhoneTyping(true);
    };
    const onOut = (e: FocusEvent) => {
      if (!typing(e.relatedTarget)) setPhoneTyping(false);
    };
    phoneTarget.addEventListener("focusin", onIn);
    phoneTarget.addEventListener("focusout", onOut);
    return () => {
      phoneTarget.removeEventListener("focusin", onIn);
      phoneTarget.removeEventListener("focusout", onOut);
    };
  }, [phoneTarget]);
  const talkEnded = liveCtx?.connection?.status === "ended";
  const sessionFull = liveCtx?.connection?.status === "full";
  const [endCardDismissed, setEndCardDismissed] = useState(false);
  // A viewer turned away at the cap, or at the end of the talk, gets one card over everything.
  const viewerCard = role === "viewer" && (sessionFull || (talkEnded && !endCardDismissed));

  // The first moment of a talk: the presenter's deck opens the join overlay by itself
  // once the session's state has arrived, if the talk is on its first slide and that
  // slide shows no join card of its own. Once per page load; any slide change, from
  // any window or phone, puts it away.
  const joinChecked = useRef(false);
  useEffect(() => {
    if (joinChecked.current || !isLive || !liveCtx?.synced) return;
    joinChecked.current = true;
    if (
      shouldOpenJoinAtStart({
        role,
        joinUrl: liveCtx.viewerUrl,
        index: indexRef.current,
        joinCardsOnScreen: joinCards.current,
        coarsePointer: coarse,
      })
    ) {
      setQrState(true);
      setQrAuto(true);
    }
  }, [isLive, liveCtx?.synced, liveCtx?.viewerUrl, role, coarse]);
  const shownIndexRef = useRef(index);
  useEffect(() => {
    if (shownIndexRef.current === index) return;
    shownIndexRef.current = index;
    if (qrRef.current) setQr(false);
  }, [index, setQr]);

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
  // long deck, and give it DOM focus so the focus ring and a screen reader follow
  // the same selection the arrows move.
  useEffect(() => {
    if (!overview) return;
    const el = selectedThumbRef.current;
    if (!el) return;
    el.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
    if (overviewBoxRef.current?.contains(document.activeElement)) el.focus({ preventScroll: true });
  }, [sel, overview, reduceMotion]);

  // The overview and the driver's end card are modal: focus moves in on open and
  // returns to the deck when they close (see useDialogFocus).
  useDialogFocus(overview, overviewBoxRef, () => selectedThumbRef.current);
  useDialogFocus((ended || mask) && !overview && canDrive, endCardRef);

  return (
    <MDXProvider components={mdxComponents}>
     <JoinCardPresence.Provider value={registerJoinCard}>
     <PhoneViewContext.Provider value={phoneView}>
     <BackdropProvider backdrop={backdrop}>
      <PersistentProvider>
       {/* 100dvh (dynamic viewport), NOT 100vh: on mobile the browser's address
           bar makes 100vh taller than the visible area, which would push the slide
           bottom + the viewport-pinned chrome below the fold. */}
       {/* The deck is the page's main landmark and the place focus returns to when a
           dialog closes (tabIndex -1: focusable by script, never a Tab stop). */}
       <main
         aria-label="Presentation"
         data-pi-focus-home
         tabIndex={-1}
         className="relative h-dvh w-screen overflow-hidden bg-bg outline-none"
       >
        <ScaledStage
          className={phoneLayout ? "absolute inset-x-0 top-0" : "absolute inset-0"}
          style={phoneLayout ? { height: PHONE_STRIP } : undefined}
        >
          <div data-deck-root data-slide={index} className="absolute inset-0 bg-bg">
            {/* One backdrop per view, behind the transition stack: a slide change
                crossfades transparent content over it instead of mounting a
                second decorated frame. */}
            <Backdrop />
            <AnimatePresence
              custom={direction}
              onExitComplete={() => {
                // Restart kept the end card up to mask the crossfade to slide 1; the
                // exiting last slide is now gone, so it's safe to drop the card.
                setMask(false);
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

            <HelpOverlay open={help} onClose={() => setHelp(false)} showBrand={brands.length > 1} role={role} ejectable={ejectable} legal={menuLegal} />
            <PortraitHint suppressed={phoneLayout || viewerCard} />
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
                <svg aria-hidden width="84" height="84" viewBox="0 0 24 24" fill="none" stroke="var(--brand-muted)" strokeWidth="1.4" opacity="0.5">
                  <path d="M2 12s3.5-6 10-6 10 6 10 6" strokeLinecap="round" />
                  <path d="M2 12s3.5 4 10 4 10-4 10-4" strokeLinecap="round" />
                </svg>
              </motion.div>
            )}
          </AnimatePresence>
        </ScaledStage>

        {/* The phone-first panel: the current slide's interactive plugins at device
            scale, below the slide strip and above the bottom rail (menu, reactions,
            the counter and a "Published with" badge stay clear of it). Present only
            on a viewer's portrait phone; shown while a plugin is in it. */}
        {phoneOn && (
          <div
            ref={setPhoneTarget}
            data-pi-phone-panel
            data-pi-no-nav
            hidden={!phoneLayout}
            inert={talkEnded}
            className="absolute inset-x-0 z-20 overflow-y-auto overscroll-contain border-t border-border bg-bg px-3 pt-3 pb-4"
            style={{
              top: phoneTyping ? 0 : PHONE_STRIP,
              bottom: "calc(4.25rem + env(safe-area-inset-bottom))",
              opacity: talkEnded ? 0.55 : 1,
              // the panel already scrolls as a whole: lists inside it don't get a cap of their own
              ["--pi-scroll-area-max" as string]: "none",
            }}
          >
            {talkEnded && (
              <div role="status" className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-muted">
                {msgs().endedPanel}
              </div>
            )}
          </div>
        )}

        {/* QR + overview render OUTSIDE the scaled canvas (device scale) so they're
            full-size on a phone, the touch ⋮ menu opens them. */}
        <LiveStatusBadge state={liveCtx?.connection} role={role} online={liveCtx?.online} className="absolute left-3 top-3 z-30" />
        {/* A viewer turned away at the audience cap, or at the end of the talk: one card
            over everything that says so (the ended card can be put away). */}
        {viewerCard && (
          <ViewerStateCard state={sessionFull ? "full" : "ended"} onDismiss={() => setEndCardDismissed(true)} />
        )}
        <QrOverlay
          open={qr}
          url={liveCtx?.viewerUrl}
          hint={qrAuto ? START_HINT : undefined}
          onClose={() => setQr(false)}
        />
        <AnimatePresence>
          {overview && (
            <motion.div
              ref={overviewBoxRef}
              data-pi-chrome
              role="dialog"
              aria-modal="true"
              aria-label="Slide overview"
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
                    aria-label={`Slide ${i + 1}`}
                    aria-current={i === index ? "true" : undefined}
                    className={`relative aspect-video overflow-hidden rounded-xl border text-left transition ${
                      i === sel
                        ? "border-primary ring-2 ring-primary"
                        : i === index
                          ? "border-primary"
                          : "border-border hover:border-text"
                    }`}
                  >
                    <DeckThumb Component={s.Component} src={thumbs?.get(i)} alt={`Slide ${i + 1}`} />
                    <span aria-hidden className="absolute bottom-1 right-2 font-mono text-xs text-muted">{i + 1}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* terminal end-of-deck card (advancing past the last slide) — a calm,
            deliberate stop, NOT a wrap; covers the slide + ambient motion. For the
            DRIVER, tapping the backdrop goes back and the action row offers Back /
            Overview / Restart. A live viewer gets the card with none of that: the
            state is shared so the audience sees the deck has ended, but the controls
            act on everyone's deck and the overview is presenter-only, so showing an
            audience buttons that either do nothing or leak the whole deck would be
            worse than showing none. */}
        <AnimatePresence>
          {(ended || mask) && !overview && (
            <motion.div
              ref={endCardRef}
              data-pi-chrome
              // The driver gets a modal with actions; a live viewer gets the same card
              // as a status message (nothing to operate, just "the deck has ended").
              role={canDrive ? "dialog" : "status"}
              aria-modal={canDrive ? "true" : undefined}
              aria-label="End of deck"
              tabIndex={-1}
              className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-bg text-center outline-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.3 }}
              onClick={canDrive ? () => setEnded(false) : undefined}
            >
              <div className="space-y-2">
                <div className="font-mono text-sm uppercase tracking-[0.3em] text-muted">End of deck</div>
                <div className="font-mono text-xs text-muted">{count} {count === 1 ? "slide" : "slides"}</div>
              </div>
              {canDrive && (
                <>
                  <div className="flex flex-wrap items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setEnded(false)} aria-label="Back to the last slide" className="rounded-lg border border-border px-4 py-2 font-mono text-sm text-text transition hover:border-text">← Back</button>
                    <button onClick={openOverview} className="rounded-lg border border-border px-4 py-2 font-mono text-sm text-text transition hover:border-text">Overview</button>
                    <button onClick={onRestart} aria-label="Restart from slide 1" className="rounded-lg border border-border px-4 py-2 font-mono text-sm text-text transition hover:border-text">↺ Restart</button>
                  </div>
                  <div className="font-mono text-[0.7rem] text-muted">← back · O overview · R restart · type a number to jump</div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* numeric-jump HUD — a single top layer above EVERY overlay (device scale), so
            typing a number reads correctly in slide and end modes. In the overview the
            buffer renders in its header instead (the grid is the jump surface). */}
        <AnimatePresence>
          {jump && !overview && (
            <motion.div
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
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
          legal={menuLegal}
        />
       </main>
      </PersistentProvider>
     </BackdropProvider>
     </PhoneViewContext.Provider>
     </JoinCardPresence.Provider>
    </MDXProvider>
  );
}
