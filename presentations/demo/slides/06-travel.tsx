import { Slot, Magic } from "@liebstoeckel/engine";

// The consecutive case for BOTH mechanisms:
//  • <Slot id="live"> moved LEFT → the persistent iframe springs across, state intact.
//  • <Magic id="spark"> with new text/size/position → it morphs from the previous
//    slide's spark (different element, stateless) while the iframe travels the other way.
// Spark is a sibling of the content row → anchored to the slide frame, top-right
// corner (empty margin), so it morphs diagonally from the previous slide without
// landing on the heading.
export default function Travel() {
  return (
    <>
      <Magic id="spark" className="absolute right-0 top-0 font-heading text-7xl text-primary">
        two ✦
      </Magic>
      <div className="flex items-center gap-12">
        <Slot id="live" className="h-80 w-[30rem] shrink-0 rounded-2xl" />
        <div>
          <h2 className="font-heading text-5xl font-bold text-text">…and it travels</h2>
          <p className="mt-4 font-body text-2xl text-muted">
            The iframe glided left (a <code>Slot</code>); the ✦ morphed across, grew, and
            crossfaded its text (a <code>Magic</code> move) — opposite directions, one transition.
          </p>
        </div>
      </div>
    </>
  );
}
