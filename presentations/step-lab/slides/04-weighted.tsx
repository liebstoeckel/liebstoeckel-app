import { CodeMagic, Slot, type TokenizedStep } from "@liebstoeckel/engine";
import { codeStory } from "@liebstoeckel/engine/code" with { type: "macro" };
import { Lab, Reveal } from "../elements/Reveal";

// Four code states claim THREE reveal slots (a state change per press), and the
// Step below claims one more. So this slide's reveal count is 4 while it contains
// only two reveal consumers: the interesting case for anything that assumes one
// consumer means one step.
const STORY = codeStory([
  { code: `const total = steps.length`, lang: "ts" },
  { code: `const total = steps.reduce((n, s) => n + s.weight, 0)`, lang: "ts" },
  {
    code: `const total = steps.reduce((n, s) => n + s.weight, 0)
const shown = resolveStep(step, total)`,
    lang: "ts",
  },
  {
    code: `const total = steps.reduce((n, s) => n + s.weight, 0)
const shown = resolveStep(step, total)
// entering backwards: shown === total`,
    lang: "ts",
  },
]) as unknown as TokenizedStep[];

export const notes = (
  <div>
    <p>
      <strong>Weighted reveals.</strong> The code block claims three slots and the reveal below claims one, so this
      slide counts four even though it has two consumers.
    </p>
    <p>
      Entering backwards must land on the <em>last</em> code state with the reveal showing. If it lands on the first
      code state, the sentinel was resolved against the wrong count.
    </p>
  </div>
);

export default function Weighted() {
  return (
    <div className="flex h-full w-full items-center gap-12">
      <div className="w-[38%] shrink-0">
        <Lab n={4} title="Weighted" sub="One consumer, three slots. Plus a plain reveal." />
        <Reveal n={4}>the fourth slot, after the code finishes</Reveal>
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-center">
        <CodeMagic title="steps.ts" steps={STORY} />
      </div>
      <Slot id="probe" className="h-48 w-56 shrink-0" />
    </div>
  );
}
