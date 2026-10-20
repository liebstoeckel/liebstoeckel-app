// Native esbuild for the host: the package's JS API drives its platform binary as
// a child process. The core takes esbuild as a parameter, so a later host can pass
// esbuild-wasm instead with no other change.
import * as native from "esbuild";
import type { Esbuild } from "./core/esbuild.ts";

export const esbuild: Esbuild = native;
