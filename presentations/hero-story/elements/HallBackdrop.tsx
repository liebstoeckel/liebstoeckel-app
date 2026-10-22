// The deck's backdrop: one 3D lecture hall that stays mounted for the whole
// talk. Slides only carry the words; this component follows the slide it is
// drawn behind (`slide`, from the engine) and moves the camera through the hall,
// beat by beat.
//
// On still surfaces (thumbnails, the overview, print, presenter previews) it
// renders its slide's shot once, keeps the picture as an image and lets the 3D
// context go, so a grid of thumbnails does not hold a WebGL context each.

import { useEffect, useRef, useState } from "react";
import { Story, type Anchors } from "./scene/story";
import { Overlay } from "./Overlay";

export function HallBackdrop({ still = false, slide }: { still?: boolean; slide?: number }) {
  const beat = slide ?? 0;
  const canvas = useRef<HTMLCanvasElement>(null);
  const story = useRef<Story | null>(null);
  const place = useRef<((a: Anchors) => void) | null>(null);
  const first = useRef(beat);
  const [picture, setPicture] = useState<string | null>(null);

  useEffect(() => {
    const el = canvas.current!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const s = new Story(el, { still, reduced });
    story.current = s;
    s.setBeat(first.current);
    let w = 0;
    let h = 0;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || (Math.abs(r.width - w) < 0.5 && Math.abs(r.height - h) < 0.5)) return r.width >= 1;
      w = r.width;
      h = r.height;
      s.resize(w, h);
      return true;
    };
    s.onFrame = (a) => {
      // the deck scales its stage with a transform, which no resize observer
      // sees, so the shown size is checked as part of each frame
      measure();
      place.current?.(a);
    };

    let alive = true;
    if (still) {
      const snap = (tries: number) => {
        if (!alive) return;
        if (!measure() && tries < 30) {
          requestAnimationFrame(() => snap(tries + 1));
          return;
        }
        s.refreshText();
        setPicture(el.toDataURL("image/png"));
        s.dispose();
      };
      void (document.fonts?.ready ?? Promise.resolve()).then(() => requestAnimationFrame(() => snap(0)));
    } else {
      measure();
      s.start();
      void document.fonts?.ready.then(() => alive && s.refreshText());
    }
    return () => {
      alive = false;
      story.current = null;
      s.dispose();
    };
  }, [still]);

  useEffect(() => {
    story.current?.setBeat(beat);
  }, [beat]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: "#10140e" }}>
      <canvas ref={canvas} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: picture ? "none" : "block" }} />
      {picture && <img src={picture} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />}
      <Overlay beat={beat} still={still} register={(fn) => (place.current = fn)} />
    </div>
  );
}
