import { Step } from "@liebstoeckel/engine";
import { Counter } from "../components/Counter";
import { Kicker } from "../components/Kicker";

export const notes = (
  <div>
    <p>Fixture notes: the presenter view shows this.</p>
  </div>
);

export default function Intro() {
  return (
    <div className="w-full">
      <Kicker>Release fixture</Kicker>
      <h1 id="fx-title" className="font-heading text-[88px] font-semibold leading-[0.95] tracking-[-0.03em] text-text">
        Every feature, one deck
      </h1>
      <div className="mt-10 space-y-4 font-body text-2xl text-muted">
        <Step>One: a step</Step>
        <Step>Two: another step</Step>
        <Step>Three: the last step</Step>
      </div>
      <Counter />
    </div>
  );
}
