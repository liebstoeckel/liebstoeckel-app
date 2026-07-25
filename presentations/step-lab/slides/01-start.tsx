import { Slot } from "@liebstoeckel/engine";
import { Lab } from "../elements/Reveal";

export const notes = (
  <div>
    <p>
      <strong>No reveals on this slide.</strong> Entering it backwards should look identical to entering it forwards,
      because "fully revealed" and "unrevealed" are the same thing when there is nothing to reveal.
    </p>
    <p>The probe on the right is a persistent element: its clock and click count must never reset.</p>
  </div>
);

export default function Start() {
  return (
    <div className="flex h-full w-full items-center gap-14">
      <div className="min-w-0 flex-1">
        <Lab n={1} title="Step lab" sub="A deck for poking at reveal state across slide boundaries." />
        <ul className="space-y-2 font-body text-xl text-muted">
          <li>
            <span className="font-mono text-accent">→</span> reveals, then advances
          </li>
          <li>
            <span className="font-mono text-accent">←</span> hides the last reveal, then goes back a slide{" "}
            <span className="text-text">fully revealed</span>
          </li>
          <li>
            <span className="font-mono text-accent">o</span> overview and <span className="font-mono text-accent">2</span>
            <span className="font-mono text-accent"> ⏎</span> jump, both landing unrevealed
          </li>
          <li>
            <span className="font-mono text-accent">p</span> opens the presenter window
          </li>
        </ul>
        <p className="mt-6 font-body text-lg text-muted">
          This slide has <span className="text-text">no reveals at all</span>, which is its own edge case.
        </p>
      </div>
      <Slot id="probe" className="h-64 w-72 shrink-0" />
    </div>
  );
}
