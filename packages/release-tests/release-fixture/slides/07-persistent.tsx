import { Slot } from "@liebstoeckel/engine";
import { Kicker } from "../components/Kicker";

export default function Persistent() {
  return (
    <div className="w-full">
      <Kicker>Persistent layer</Kicker>
      <h2 className="font-heading text-5xl font-semibold text-primary">A slot for a deck-wide element</h2>
      <Slot id="badge" className="mt-10 h-40 w-full rounded-2xl border border-border" />
    </div>
  );
}
