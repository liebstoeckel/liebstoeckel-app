import { Slot } from "@liebstoeckel/engine";

// A plain TSX slide (proves MDX + TSX slides coexist). The same <Slot id="live">
// at a new size/position makes the persistent iframe travel here — state intact.
export default function Closing() {
  return (
    <div className="flex items-center gap-12">
      <div>
        <h2 className="font-heading text-5xl font-bold text-text">Same iframe, new spot</h2>
        <p className="mt-4 font-body text-2xl text-muted">
          It morphed here — and the clock never reset.
        </p>
      </div>
      <Slot id="live" className="h-72 w-96 shrink-0 rounded-2xl" />
    </div>
  );
}
