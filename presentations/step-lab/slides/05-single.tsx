import { Slot } from "@liebstoeckel/engine";
import { Lab, Reveal } from "../elements/Reveal";

export const notes = (
  <div>
    <p>
      <strong>Exactly one reveal.</strong> The smallest slide that still has a reveal, where "all shown" and "one shown"
      are the same state. Worth stepping through slowly in both directions.
    </p>
    <p>The probe returns here after being hidden on slide 3.</p>
  </div>
);

export default function Single() {
  return (
    <div className="flex h-full w-full items-center gap-14">
      <div className="min-w-0 flex-1">
        <Lab n={5} title="One reveal" sub="Where fully revealed and one-revealed are the same state." />
        <Reveal n={1}>the only one</Reveal>
      </div>
      <Slot id="probe" className="h-64 w-72 shrink-0" />
    </div>
  );
}
