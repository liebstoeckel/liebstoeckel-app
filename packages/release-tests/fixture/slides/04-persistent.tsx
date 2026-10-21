import { Slot } from "@liebstoeckel/engine";

// Exercises the persistent layer: a <Slot> reserves a box and the deck-wide
// persistent element is projected onto it. The e2e guard asserts the projected
// element lines up with this slot even when the stage is scaled (< 1:1).
export default function Persistent() {
  return (
    <div className="w-full">
      <h2 className="font-heading text-5xl font-semibold text-primary">Persistent slot</h2>
      <Slot id="live" className="mt-10 h-56 w-full rounded-2xl border border-surface" />
    </div>
  );
}
