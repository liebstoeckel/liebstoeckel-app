import { useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import { MDXProvider } from "@mdx-js/react";
import { mdxComponents } from "@liebstoeckel/components";
import { useTheme } from "@liebstoeckel/plugin-ui";
import type { PluginDef } from "@liebstoeckel/plugin-sdk";
import { STAGE_H, STAGE_W, SlideFrame } from "./Stage";
import { Backdrop } from "./backdrop";
import { PersistentProvider } from "./PersistentLayer";
import { StepsProvider } from "./steps";
import { LiveProvider, type LiveContextValue } from "./live/Plugin";
import { normalizeSlides } from "./slides";
import type { DeckProps } from "./Deck";
import {
  PRINT_READY,
  PRINT_SELECT_EVENT,
  SLIDE_COUNT,
  printRequest,
  type PrintSelect,
} from "./build/capture-protocol";

// Past any real slide's step count, so every <Step> is revealed for a complete,
// final-state page (reveals start at target, <Step> uses initial={false}).
const ALL_STEPS = 1e6;

/** Build-time **print** render (vector PDF export): every selected slide laid out
 *  at the native 1280×720 canvas, each forced onto its own print page, so a single
 *  headless `page.pdf()` produces a multi-page, text-preserving PDF. No nav, no
 *  AnimatePresence, no scaling, final state only. Driven via the print protocol:
 *  publishes SLIDE_COUNT, renders the indices it's handed (PRINT_SELECT_EVENT), and
 *  echoes the select token into PRINT_READY once that selection has painted.
 *
 *  Each slide gets its own PersistentProvider: persistent travel ((internal ADR)) is a
 *  live-nav concept, so in a static all-slides layout each slide just renders its
 *  own elements in final position. */
export function PrintView({ slides, brands = ["default"], plugins = [] }: DeckProps) {
  const norm = useMemo(() => normalizeSlides(slides), [slides]);

  // Offline (live:false) plugin context → each <Plugin> renders its fallback, same
  // as opening the standalone .html (mirrors CaptureView).
  const theme = useTheme();
  const doc = useMemo(() => new Y.Doc(), []);
  const liveValue = useMemo<LiveContextValue>(
    () => ({
      live: false,
      role: "presenter",
      participant: "print",
      doc,
      theme,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      plugins: Object.fromEntries(plugins.map((p) => [p.id, p])) as Record<string, PluginDef<any>>,
    }),
    [doc, theme, plugins],
  );

  // The slides to lay out, and the token to echo once they've painted. The driver
  // sends a PRINT_SELECT once it knows the count; until then, honor a flag-supplied
  // list (or all slides) so a standalone print also works.
  const request = useMemo(() => printRequest(), []);
  const initial = request?.indices;
  // Paper page (PDF export onto A4/Letter/...): the slide is fitted and centered
  // on a white page. Without it the page is the canvas itself. The box the DOM
  // fills is floored so a sub-pixel overhang never spills onto a blank extra page.
  const paper = request?.page;
  const pageW = paper ? Math.floor(paper.width) : STAGE_W;
  const pageH = paper ? Math.floor(paper.height) : STAGE_H;
  const fit = useMemo(() => {
    if (!paper) return { x: 0, y: 0, scale: 1 };
    const availW = Math.max(0, pageW - 2 * paper.margin);
    const availH = Math.max(0, pageH - 2 * paper.margin);
    const scale = Math.min(availW / STAGE_W, availH / STAGE_H);
    return { x: (pageW - STAGE_W * scale) / 2, y: (pageH - STAGE_H * scale) / 2, scale };
  }, [paper, pageW, pageH]);
  const [sel, setSel] = useState<PrintSelect>(() => ({
    indices: initial && initial.length ? initial : norm.map((_, i) => i),
    token: 0,
  }));

  useEffect(() => {
    document.body.dataset.brand = brands[0];
  }, [brands]);

  // Publish the slide count and follow the driver's selection.
  useEffect(() => {
    const g = globalThis as Record<string, unknown>;
    g[SLIDE_COUNT] = norm.length;
    const onSelect = (e: Event) => {
      const detail = (e as CustomEvent<PrintSelect>).detail;
      if (detail && Array.isArray(detail.indices)) setSel(detail);
    };
    window.addEventListener(PRINT_SELECT_EVENT, onSelect as EventListener);
    return () => window.removeEventListener(PRINT_SELECT_EVENT, onSelect as EventListener);
  }, [norm.length]);

  const chosen = useMemo(
    () => sel.indices.filter((i) => Number.isInteger(i) && i >= 0 && i < norm.length),
    [sel.indices, norm.length],
  );

  // Signal "this selection has painted" after two animation frames + the deck's
  // fonts, so the exporter prints a settled document. Reset first so a stale token
  // is never read.
  useEffect(() => {
    const g = globalThis as Record<string, unknown>;
    g[PRINT_READY] = -1;
    let raf1 = 0;
    let raf2 = 0;
    const fonts = (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready;
    Promise.resolve(fonts).then(() => {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          g[PRINT_READY] = sel.token;
        });
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [sel.token, chosen.length]);

  return (
    <LiveProvider value={liveValue}>
      <MDXProvider components={mdxComponents}>
        {/* one page per slide; exact-size, clipped, page-broken. white page gutter
            never shows because each block fills the page (margin:0 in page.pdf). */}
        <style>{`@page { size: ${paper ? paper.width : STAGE_W}px ${paper ? paper.height : STAGE_H}px; margin: 0 }
/* The deck is fullscreen (theme sets html,body{height:100%;overflow:hidden}). For
   print we must let the document GROW so the stacked slides paginate, otherwise it
   clips to one viewport and only slide 1 prints. */
html, body { height: auto !important; min-height: 0 !important; overflow: visible !important; margin: 0; padding: 0; background: #fff }
#root { height: auto !important; overflow: visible !important; position: static !important }
[data-print-page] { break-inside: avoid }`}</style>
        <div data-print-root>
          {chosen.map((idx, n) => {
            const Current = norm[idx]?.Component ?? (() => null);
            return (
              <div
                key={idx}
                data-print-page
                className={paper ? undefined : "bg-bg"}
                style={{
                  position: "relative",
                  width: pageW,
                  height: pageH,
                  overflow: "hidden",
                  background: paper ? "#fff" : undefined,
                  breakAfter: n < chosen.length - 1 ? "page" : "auto",
                }}
              >
                {/* the canvas, scaled with a CSS transform (text stays vector under
                    page.pdf) and centered inside the paper's printable area */}
                <div
                  data-print-slide
                  className="bg-bg"
                  style={{
                    position: "absolute",
                    left: fit.x,
                    top: fit.y,
                    width: STAGE_W,
                    height: STAGE_H,
                    overflow: "hidden",
                    transform: fit.scale === 1 ? undefined : `scale(${fit.scale})`,
                    transformOrigin: "top left",
                  }}
                >
                  <PersistentProvider>
                    <Backdrop still />
                    <SlideFrame>
                      <StepsProvider step={ALL_STEPS} slideIndex={idx}>
                        <Current />
                      </StepsProvider>
                    </SlideFrame>
                  </PersistentProvider>
                </div>
              </div>
            );
          })}
        </div>
      </MDXProvider>
    </LiveProvider>
  );
}
