import type { BunPlugin } from "bun";
import { compile } from "@mdx-js/mdx";
import rehypeShiki from "@shikijs/rehype";
import { createCssVariablesTheme } from "shiki";

// Fenced code blocks are highlighted at build time with Shiki's css-variables
// theme: each token gets color:var(--shiki-token-*), which @liebstoeckel/theme binds
// to the active brand. No highlighter/grammars/WASM ship to the browser.
const codeTheme = createCssVariablesTheme({ name: "brand", variablePrefix: "--shiki-", fontStyle: true });

// Compiles `.mdx` → JS using the automatic React runtime. providerImportSource
// wires MDX elements to <MDXProvider> components. A Bun plugin, for the
// deprecated Bun pipeline (`bundleDeck` here) only: liebstoeckel builds and
// serves decks with @liebstoeckel/build, which compiles MDX itself.
const mdxPlugin: BunPlugin = {
  name: "mdx",
  setup(build) {
    build.onLoad({ filter: /\.mdx$/ }, async (args) => {
      const source = await Bun.file(args.path).text();
      const compiled = await compile(source, {
        jsxImportSource: "react",
        providerImportSource: "@mdx-js/react",
        development: false,
        // Only the grammars the deck's fences use (all of them on the first MDX
        // file cost about 6 s), no per-line time limit (a cold build otherwise
        // ships wrongly split tokens). Unknown languages stay plain.
        rehypePlugins: [[rehypeShiki, { theme: codeTheme, langs: [], lazy: true, onError: () => {}, tokenizeTimeLimit: 0 }]],
      });
      return { contents: String(compiled), loader: "js" };
    });
  },
};

export default mdxPlugin;
