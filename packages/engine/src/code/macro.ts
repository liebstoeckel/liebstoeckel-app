// Bun macro entrypoint. Import it with `with { type: "macro" }` from a deck so the
// code is tokenized at BUILD time and the result inlined as a literal — no Shiki,
// grammars, or WASM ship to the browser. Pass string literals so the bundler can
// evaluate the call statically.
//
//   import { codeStory } from "@present-it/engine/code" with { type: "macro" };
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
