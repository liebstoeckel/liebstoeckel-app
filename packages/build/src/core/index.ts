// @liebstoeckel/build/core: the dev server's module core for hosts that are not Bun
// or Node, such as a browser worker running esbuild-wasm. Nothing on this path uses
// a Bun or Node API: the host passes esbuild and the files in. It serves a deck's
// modules unbundled, works out the hot update for each change, and regenerates the
// stylesheets in a lane of its own. Experimental: for hosts, not for decks.
export { DevCore, type DevCoreOptions, type DevMessage, type DepsManifest, type Served } from "./dev.ts";
export { MemoryFiles, type Files, type Snapshot, type SnapshotEntry, type Stat } from "./files.ts";
export { hostedTree, type HostedTreeSettings } from "./hosted.ts";
export type { Esbuild } from "./esbuild.ts";
export type { BuildMessage } from "./build.ts";
export type { Notice } from "./load.ts";
export type { ResolverOptions } from "./resolve.ts";
