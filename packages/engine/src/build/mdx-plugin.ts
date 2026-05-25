import type { BunPlugin } from "bun";
import { compile } from "@mdx-js/mdx";

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
      });
      return { contents: String(compiled), loader: "js" };
    });
  },
};

export default mdxPlugin;
