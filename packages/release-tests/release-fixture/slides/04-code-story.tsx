import { CodeMagic, type TokenizedStep } from "@liebstoeckel/engine";
import { codeStory } from "@liebstoeckel/engine/code" with { type: "macro" };
import { Kicker } from "../components/Kicker";

// The deprecated macro, as 0.3 decks wrote it: it must still build (with a warning).
const STORY = codeStory([
  { code: `const ready = false`, lang: "ts" },
  { code: `const ready = true`, lang: "ts" },
]) as unknown as TokenizedStep[];

export default function CodeStory() {
  return (
    <div className="w-full">
      <Kicker>codeStory (deprecated)</Kicker>
      <CodeMagic title="ready.ts" steps={STORY} />
    </div>
  );
}
