// MDX to JS, configured exactly like the engine's Bun plugin (automatic React
// runtime, the MDX provider, Shiki with the brand's css-variables theme), so a
// slide compiles to the same code here, in the CLI and in the browser.
import { compile } from "@mdx-js/mdx";
import rehypeShiki from "@shikijs/rehype";
import { createCssVariablesTheme } from "shiki";

const codeTheme = createCssVariablesTheme({ name: "brand", variablePrefix: "--shiki-", fontStyle: true });

export async function compileMdx(source: string): Promise<string> {
  const compiled = await compile(source, {
    jsxImportSource: "react",
    providerImportSource: "@mdx-js/react",
    development: false,
    // `lazy` loads only the grammars a deck's code fences use. Without it Shiki
    // loads every bundled language on the first MDX file (about 6 s natively, and
    // megabytes of grammars in a browser). Unknown languages stay unhighlighted,
    // as before (onError swallows the failed load instead of failing the build).
    // No tokenize time limit, for the reason given in code.ts.
    rehypePlugins: [[rehypeShiki, { theme: codeTheme, langs: [], lazy: true, onError: () => {}, tokenizeTimeLimit: 0 }]],
  });
  return String(compiled);
}
