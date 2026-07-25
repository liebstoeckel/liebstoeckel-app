import { Slot } from "@liebstoeckel/engine";
import { Lab, Reveal } from "../elements/Reveal";

export const notes = (
  <div>
    <p>
      <strong>The end of the deck.</strong> Reveal all three, then keep pressing <kbd>→</kbd>.
    </p>
    <p>
      In the deck window you get the end card (← back, o overview, r restart). In this presenter window nothing should
      happen at all, and Next is disabled. What must never happen is the three reveals below resetting and replaying.
    </p>
    <p>Then press ← to come back in: all three should be showing again.</p>
  </div>
);

export default function Finale() {
  return (
    <div className="flex h-full w-full items-center gap-14">
      <div className="min-w-0 flex-1">
        <Lab n={6} title="The end" sub="Reveal all three, then keep pressing right." />
        <div className="space-y-3">
          <Reveal n={1}>first</Reveal>
          <Reveal n={2}>second</Reveal>
          <Reveal n={3}>last one, then the deck ends</Reveal>
        </div>
      </div>
      <Slot id="probe" className="h-64 w-72 shrink-0" />
    </div>
  );
}
