import { createContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Atmosphere } from "@liebstoeckel/components";

// Logical canvas. Everything is authored at this size and scaled to fit, so the
// audience view and presenter thumbnails are pixel-identical (just different scale).
export const STAGE_W = 1280;
export const STAGE_H = 720;

/** The factor the canvas is scaled by to fit its parent (1 = unscaled). Consumers
 *  (e.g. plugins) read it to decide when inline controls are too small to tap. */
export const StageScaleContext = createContext(1);

/** Fits a fixed STAGE_W×STAGE_H canvas into its parent, centered + letterboxed.
 *  The fit transform is expressed as **Motion values** — `scale` + a centering
 *  `x`/`y` translate, about a **top-left** origin — not a CSS `transform` string and
 *  not a center `transform-origin`. Motion's layout-projection tree only accounts
 *  for transforms it owns and assumes a top-left origin, so this is what keeps
 *  `layoutId`/`layout` morphs (`Magic`, `CodeMagic`) correct under the scaled stage
 *  (Motion #3356/#874). The outer div must be a positioned containing block for the
 *  absolute canvas (all consumers pass `absolute`/`fixed inset-0`). */
export function ScaledStage({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 0, x: 0, y: 0 });

  useLayoutEffect(() => {
    const el = ref.current!;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      const scale = Math.min(width / STAGE_W, height / STAGE_H);
      setFit({ scale, x: (width - STAGE_W * scale) / 2, y: (height - STAGE_H * scale) / 2 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className={`overflow-hidden bg-bg ${className ?? ""}`}>
      <StageScaleContext.Provider value={fit.scale || 1}>
        <motion.div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: STAGE_W,
            height: STAGE_H,
            originX: 0,
            originY: 0,
            scale: fit.scale || 0.0001,
            x: fit.x,
            y: fit.y,
            visibility: fit.scale ? "visible" : "hidden",
          }}
        >
          {children}
        </motion.div>
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
