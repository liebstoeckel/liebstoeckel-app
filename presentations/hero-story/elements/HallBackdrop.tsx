// The deck's backdrop: one 3D lecture hall that stays mounted for the whole
// talk. Slides only carry the words; this component follows the deck's current
// slide and moves the camera through the hall, beat by beat.
//
// A backdrop receives no slide index from the engine, but the deck root it
// renders inside carries the current one as `data-slide`, so the hall watches
// that attribute.

import { useEffect, useRef, useState } from "react";
import { Story, type Anchors } from "./scene/story";
import { Overlay } from "./Overlay";

export function HallBackdrop({ still = false }: { still?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const place = useRef<((a: Anchors) => void) | null>(null);
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    const el = canvas.current!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const story = new Story(el, { still, reduced });
    let w = 0;
    let h = 0;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || (Math.abs(r.width - w) < 0.5 && Math.abs(r.height - h) < 0.5)) return;
      w = r.width;
      h = r.height;
      story.resize(w, h);
    };
    story.onFrame = (a) => {
      // the deck scales its stage with a transform, which no resize observer
      // sees, so the shown size is checked as part of each frame
      measure();
      place.current?.(a);
    };

    const root = host.current!.closest("[data-deck-root]");
    const read = () => {
      const i = Number(root?.getAttribute("data-slide") ?? 0) || 0;
      story.setBeat(i);
      setBeat(i);
    };
    read();
    const watch = root ? new MutationObserver(read) : null;
    watch?.observe(root!, { attributes: true, attributeFilter: ["data-slide"] });

    measure();
    story.start();
    void document.fonts?.ready.then(() => story.refreshText());
    return () => {
      watch?.disconnect();
      story.dispose();
    };
  }, [still]);

  return (
    <div ref={host} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: "#10140e" }}>
      <canvas ref={canvas} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
      <Overlay beat={beat} still={still} register={(fn) => (place.current = fn)} />
    </div>
  );
}
