// The deck's backdrop: one 3D lecture hall that stays mounted for the whole
// talk. Slides only carry the words; this component follows the slide it is
// drawn behind (`slide`, from the engine) and moves the camera through the hall,
// beat by beat.
//
// On still surfaces (thumbnails, the overview, print, presenter previews) it
// renders its slide's shot once, keeps the picture as an image and lets the 3D
// context go, so a grid of thumbnails does not hold a WebGL context each. A
// still surface whose slide changes (the build's thumbnail capture walks every
// slide through one backdrop) takes a new picture, on a new canvas, per slide.
//
// Framed in a page (see the bridge), the live backdrop tells the page which slide
// it shows once it has drawn, and stops drawing while the page has it out of view.
// Where the browser gives no WebGL, the words stay on a plain ground.

import { useEffect, useRef, useState } from "react";
import { Story, type Anchors } from "./scene/story";
import { Overlay } from "./Overlay";
import { isVisible, markReady, onVisibility, reportSlide } from "./bridge";

export function HallBackdrop({ still = false, slide }: { still?: boolean; slide?: number }) {
  const beat = slide ?? 0;
  const canvas = useRef<HTMLCanvasElement>(null);
  const story = useRef<Story | null>(null);
  const place = useRef<((a: Anchors) => void) | null>(null);
  const first = useRef(beat);
  const [picture, setPicture] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const stillBeat = still ? beat : -1;

  useEffect(() => {
    const el = canvas.current!;
    if (still) setPicture(null);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let s: Story;
    try {
      s = new Story(el, { still, reduced });
    } catch (err) {
      console.warn("[hero-story] no 3D hall here:", err);
      setFailed(true);
      if (!still) markReady();
      return;
    }
    story.current = s;
    s.setBeat(still ? stillBeat : first.current);
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
      if (!still) markReady();
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
    const showing = (on: boolean) => (on ? s.resume() : s.pause());
    const unwatch = still ? () => {} : onVisibility(showing);
    if (!still && !isVisible()) s.pause();
    // the camera leans a little toward a mouse or trackpad pointer
    const fine = matchMedia("(pointer: fine)").matches;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      const nx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      const ny = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
      s.setPointer(nx, ny);
    };
    const onLeave = () => s.setPointer(0, 0);
    if (!still && fine) {
      window.addEventListener("pointermove", onMove);
      document.documentElement.addEventListener("pointerleave", onLeave);
    }
    return () => {
      unwatch();
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      alive = false;
      story.current = null;
      s.dispose();
    };
  }, [still, stillBeat]);

  useEffect(() => {
    story.current?.setBeat(beat);
    if (!still) reportSlide(beat);
  }, [beat, still]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: "#10140e" }}>
      <canvas key={stillBeat} ref={canvas} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: picture || failed ? "none" : "block" }} />
      {picture && <img src={picture} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />}
      {!failed && <Overlay beat={beat} still={still} register={(fn) => (place.current = fn)} />}
    </div>
  );
}
