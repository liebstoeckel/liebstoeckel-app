// Ambient module declarations so `tsc` can type-check decks that import non-TS
// assets (handled at build time by Bun plugins). Part of the OSS mirror
// (copy.bara.sky includes types/**): tsconfig.typecheck.json includes "types",
// so the public tree fails typecheck without this file.
declare module "*.mdx" {
  import type { ComponentType } from "react";
  const MDXComponent: ComponentType;
  export default MDXComponent;
  export const notes: import("react").ReactNode;
}

declare module "*.css";

declare module "bun-plugin-tailwind" {
  import type { BunPlugin } from "bun";
  const plugin: BunPlugin;
  export default plugin;
}
