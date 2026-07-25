import { Slot } from "@liebstoeckel/engine";
import { Lab, Reveal } from "../elements/Reveal";

export const notes = (
  <div>
    <p>
      <strong>The main backward test.</strong> Walk forward to slide 3, then press <kbd>←</kbd>: you should land here
      with all five reveals showing, not on a blank slide.
    </p>
    <p>Each further ← should remove 05, then 04, then 03… before finally crossing back to slide 1.</p>
    <p>Jumping here from the overview, or with 2 ⏎, should instead land with none of them showing.</p>
  </div>
);

export default function Five() {
  return (
    <div className="flex h-full w-full items-center gap-14">
      <div className="min-w-0 flex-1">
        <Lab n={2} title="Five reveals" sub="Enter backwards and all five should already be here." />
        <div className="space-y-3">
          <Reveal n={1}>first</Reveal>
          <Reveal n={2}>second</Reveal>
          <Reveal n={3}>third</Reveal>
          <Reveal n={4}>fourth</Reveal>
          <Reveal n={5}>fifth</Reveal>
        </div>
      </div>
      <Slot id="probe" className="h-64 w-72 shrink-0" />
    </div>
  );
}
