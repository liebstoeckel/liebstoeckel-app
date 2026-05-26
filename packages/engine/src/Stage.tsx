import { createContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Atmosphere } from "@present-it/components";

// Logical canvas. Everything is authored at this size and scaled to fit, so the
// audience view and presenter thumbnails are pixel-identical (just different scale).
export const STAGE_W = 1280;
export const STAGE_H = 720;

/** The factor the canvas is scaled by to fit its parent (1 = unscaled). Consumers
 *  (e.g. plugins) read it to decide when inline controls are too small to tap. */
export const StageScaleContext = createContext(1);

/** Fits a fixed STAGE_W×STAGE_H canvas into its parent, centered + letterboxed. */
export function ScaledStage({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current!;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      setScale(Math.min(width / STAGE_W, height / STAGE_H));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    // no hardcoded `position`: consumers pass `h-screen w-screen` (block) or
    // `absolute inset-0` (fill a relative parent, e.g. presenter thumbnails).
    <div ref={ref} className={`flex items-center justify-center overflow-hidden bg-bg ${className ?? ""}`}>
      <StageScaleContext.Provider value={scale || 1}>
        <div
          style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})`, visibility: scale ? "visible" : "hidden" }}
          className="relative shrink-0"
        >
          {children}
        </div>
      </StageScaleContext.Provider>
    </div>
  );
}

/** The visual frame of a slide: brand background + atmosphere + a padded content
 *  area. Slides can break out with absolute positioning for full-bleed charts.
 *  `still` renders the motionless atmosphere (thumbnails / capture). */
export function SlideFrame({
  children,
  atmosphere = true,
  still = false,
}: {
  children: ReactNode;
  atmosphere?: boolean;
  still?: boolean;
}) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-bg">
      {atmosphere && <Atmosphere still={still} />}
      <div className="absolute inset-0 flex flex-col justify-center px-24 py-20">{children}</div>
    </div>
  );
}
