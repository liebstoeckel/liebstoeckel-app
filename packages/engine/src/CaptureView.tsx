import { useEffect, useMemo, useState } from "react";
import { MDXProvider } from "@mdx-js/react";
import { mdxComponents } from "@present-it/components";
import { ScaledStage, SlideFrame } from "./Stage";
import { PersistentProvider } from "./PersistentLayer";
import { StepsProvider } from "./steps";
import { normalizeSlides } from "./slides";
import type { DeckProps } from "./Deck";
import { CAPTURE_EVENT, CAPTURE_READY, SLIDE_COUNT, captureRequest } from "./build/capture-protocol";

// A step value past any real slide's step count, so every <Step> is revealed for a
// complete, final-state frame (the reveals start at their target because Step uses
// `initial={false}`, so there's no enter animation to wait out).
const ALL_STEPS = 1e6;

/** Build-time thumbnail render: one motionless slide at a time, driven by the
 *  headless capturer via the capture protocol. No live connection, no nav, no
 *  AnimatePresence — just the final state of slide `index` on the fixed canvas. */
export function CaptureView({ slides, brands = ["default"] }: DeckProps) {
  const norm = useMemo(() => normalizeSlides(slides), [slides]);
  const [index, setIndex] = useState(() => captureRequest()?.index ?? 0);

  useEffect(() => {
    document.body.dataset.brand = brands[0];
  }, [brands]);

  // Publish the slide count and follow the capturer's index changes.
  useEffect(() => {
    const g = globalThis as Record<string, unknown>;
    g[SLIDE_COUNT] = norm.length;
    const onCapture = (e: Event) => {
      const detail = (e as CustomEvent<number>).detail;
      if (typeof detail === "number") setIndex(detail);
    };
    window.addEventListener(CAPTURE_EVENT, onCapture as EventListener);
    return () => window.removeEventListener(CAPTURE_EVENT, onCapture as EventListener);
  }, [norm.length]);

  // Signal "this slide has painted" after two animation frames, so the capturer
  // screenshots a settled frame. Reset to -1 first so a stale value is never read.
  useEffect(() => {
    const g = globalThis as Record<string, unknown>;
    g[CAPTURE_READY] = -1;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        g[CAPTURE_READY] = index;
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [index]);

  const Current = norm[index]?.Component ?? (() => null);

  return (
    <MDXProvider components={mdxComponents}>
      <PersistentProvider>
        <ScaledStage className="h-screen w-screen">
          <div data-capture-stage className="absolute inset-0">
            <SlideFrame still>
              <StepsProvider step={ALL_STEPS} slideIndex={index}>
                <Current />
              </StepsProvider>
            </SlideFrame>
          </div>
        </ScaledStage>
      </PersistentProvider>
    </MDXProvider>
  );
}
