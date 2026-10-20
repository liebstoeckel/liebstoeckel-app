import { CodeMagic } from "@liebstoeckel/engine";
// Each fenced block in the code file is one state. The build highlights them with
// Shiki and the import is the tokenized states: no highlighter ships to the browser.
import STORY from "./greet.code.md";

export const notes = (
  <div>
    <p>
      <strong>Magic Move for code.</strong> Each press morphs one code state into the next — unchanged lines glide,
      edits fade in.
    </p>
    <ul>
      <li>Highlighted by Shiki at build time; colors are bound to the brand.</li>
      <li>Press <kbd>→</kbd> twice to walk the three states.</li>
    </ul>
  </div>
);

export default function CodeSlide() {
  return (
    <div className="flex h-full w-full items-center gap-14">
      <div className="w-[38%] shrink-0">
        <div className="mb-5 flex items-center gap-3 font-mono text-sm uppercase tracking-[0.35em] text-accent">
          <span className="h-px w-8 bg-accent" />
          Code, alive
        </div>
        <h2 className="font-heading text-[56px] font-semibold leading-[0.98] tracking-[-0.02em] text-text">
          Watch the diff <span className="italic text-primary">animate</span>.
        </h2>
        <p className="mt-6 max-w-md font-body text-xl text-muted">
          Author successive states; liebstoeckel line-diffs them and springs the changes — the way you’d explain code at a
          whiteboard.
        </p>
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-center">
        <CodeMagic title="greet.ts" steps={STORY} />
      </div>
    </div>
  );
}
