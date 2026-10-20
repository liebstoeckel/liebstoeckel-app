// Deprecated: write code states into a `.code.md` file and import it instead.
//
// Imported `with { type: "macro" }` from a deck, the code is tokenized at BUILD
// time and the result inlined as a literal, so no Shiki, grammars, or WASM ship to
// the browser. @liebstoeckel/build reads the call's literal arguments (it never
// evaluates them) and calls these functions; Bun's own macro runner did the same
// in the deprecated Bun pipeline. Pass literals only.
//
//   import { codeStory } from "@liebstoeckel/engine/code" with { type: "macro" };
//   <CodeMagic steps={codeStory([{ code: `const a = 1`, lang: "ts" }, …])} />
import { tokenizeStep } from "./tokenize";
import type { TokenizedStep } from "./types";

export interface CodeInput {
  code: string;
  lang?: string;
}

/** Tokenize a sequence of code states for <CodeMagic>. */
export async function codeStory(steps: CodeInput[]): Promise<TokenizedStep[]> {
  return Promise.all(steps.map((s) => tokenizeStep(s.code, s.lang)));
}

/** Tokenize a single code state (a one-step story). */
export async function code(src: string, lang = "ts"): Promise<TokenizedStep> {
  return tokenizeStep(src, lang);
}
