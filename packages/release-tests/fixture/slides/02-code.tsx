import { CodeMagic, type TokenizedStep } from "@liebstoeckel/engine";
import { codeStory } from "@liebstoeckel/engine/code" with { type: "macro" };

const STORY = codeStory([
  { code: `const ready = false`, lang: "ts" },
  { code: `const ready = true`, lang: "ts" },
]) as unknown as TokenizedStep[];

export default function CodeSlide() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <CodeMagic title="fixture.ts" steps={STORY} />
    </div>
  );
}
