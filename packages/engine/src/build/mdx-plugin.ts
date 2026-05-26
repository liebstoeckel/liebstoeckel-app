import type { BunPlugin } from "bun";
import { compile } from "@mdx-js/mdx";
import rehypeShiki from "@shikijs/rehype";
import { createCssVariablesTheme } from "shiki";

// Fenced code blocks are highlighted at build time with Shiki's css-variables
// theme: each token gets color:var(--shiki-token-*), which @present-it/theme binds
// to the active brand. No highlighter/grammars/WASM ship to the browser.
const codeTheme = createCssVariablesTheme({ name: "brand", variablePrefix: "--shiki-", fontStyle: true });

// Compiles `.mdx` → JS using the automatic React runtime. providerImportSource
// wires MDX elements to <MDXProvider> components. Works in Bun.build() and, when
// referenced from bunfig [serve.static].plugins, in the HMR dev server.
const mdxPlugin: BunPlugin = {
  name: "mdx",
  setup(build) {
    build.onLoad({ filter: /\.mdx$/ }, async (args) => {
      const source = await Bun.file(args.path).text();
      const compiled = await compile(source, {
        jsxImportSource: "react",
        providerImportSource: "@mdx-js/react",
        development: false,
        rehypePlugins: [[rehypeShiki, { theme: codeTheme }]],
      });
      return { contents: String(compiled), loader: "js" };
    });
  },
};

export default mdxPlugin;
