import { Slot, Magic } from "@liebstoeckel/engine";

// Two ways to carry something across a slide change, side by side:
//  • <Slot id="live"> — the SAME element (the iframe), state intact, travels.
//  • <Magic id="spark"> — a DIFFERENT stateless element that morphs into the next
//    slide's Magic with the same id (position + size + content crossfade).
// The spark is a sibling of the content row, so it's anchored to the slide frame
// (full canvas) and sits in an empty corner — not over the text.
export default function Closing() {
  return (
    <>
      <Magic id="spark" className="absolute bottom-0 left-0 font-heading text-4xl text-primary">
        ✦ one
      </Magic>
      <div className="flex items-center gap-12">
        <div>
          <h2 className="font-heading text-5xl font-bold text-text">Same iframe, new spot</h2>
          <p className="mt-4 font-body text-2xl text-muted">
            The iframe is a <code>Slot</code> — same element, state kept. The ✦ is a{" "}
            <code>Magic</code> move — a stateless element that morphs to the next slide.
          </p>
        </div>
        <Slot id="live" className="h-72 w-96 shrink-0 rounded-2xl" />
      </div>
    </>
  );
}
