// Ambient module declarations so `tsc` can type-check decks that import non-TS
// assets (handled at build time by the build core). Part of the OSS mirror
// (copy.bara.sky includes types/**): tsconfig.typecheck.json includes "types",
// so the public tree fails typecheck without this file.
declare module "*.mdx" {
  import type { ComponentType } from "react";
  const MDXComponent: ComponentType;
  export default MDXComponent;
  export const notes: import("react").ReactNode;
}

declare module "*.css";

/** A code file: each fenced block is one state of an animated code block,
 *  tokenized at build time (pass it to `<CodeMagic steps>`). */
declare module "*.code.md" {
  const steps: import("@liebstoeckel/engine").TokenizedStep[];
  export default steps;
}

declare module "bun-plugin-tailwind" {
  import type { BunPlugin } from "bun";
  const plugin: BunPlugin;
  export default plugin;
}
