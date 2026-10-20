// Seam 2: transform/bundle. The core takes esbuild as a parameter: the native
// package under Bun, `esbuild-wasm` in Bun or in a browser worker. Both expose the
// same JS API, so every call below is identical in all hosts.
import type { build, transform, Loader, Plugin, PluginBuild } from "esbuild";

export interface Esbuild {
  build: typeof build;
  transform: typeof transform;
  version: string;
}

export type { Loader, Plugin, PluginBuild };
