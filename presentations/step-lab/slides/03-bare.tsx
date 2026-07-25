import { Lab, Reveal } from "../elements/Reveal";

export const notes = (
  <div>
    <p>
      <strong>No slot on this slide.</strong> The persistent probe has nowhere to sit, so it hides on arrival and comes
      back when you leave. Its clock must keep running the whole time: if it resets, the element was destroyed rather
      than hidden.
    </p>
    <p>Two reveals, so the reveal count changes in both directions across this boundary (5 → 2 → 4).</p>
  </div>
);

export default function Bare() {
  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col justify-center">
      <Lab
        n={3}
        title="No slot here"
        sub="The persistent probe hides on this slide, then reappears. It must not restart."
      />
      <div className="space-y-3">
        <Reveal n={1}>only two reveals on this one</Reveal>
        <Reveal n={2}>so the count differs from its neighbours</Reveal>
      </div>
    </div>
  );
}
