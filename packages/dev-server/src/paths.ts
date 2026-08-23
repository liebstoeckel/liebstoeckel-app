import { join } from "node:path";

// Filesystem layout of the local dev mode. Everything lives under
// `.liebstoeckel/dev/` in the deck; only the local backend and the CLI need
// these, the protocol itself never sees a path.

/** All dev-mode state lives under `.liebstoeckel/dev/` in the deck. */
export function devDir(deckDir: string): string {
  return join(deckDir, ".liebstoeckel", "dev");
}

export function storePath(deckDir: string): string {
  return join(devDir(deckDir), "annotations.json");
}

export function screenshotsDir(deckDir: string): string {
  return join(devDir(deckDir), "screenshots");
}

export function snapshotsDir(deckDir: string): string {
  return join(devDir(deckDir), "snapshots");
}

export function serverInfoPath(deckDir: string): string {
  return join(devDir(deckDir), "server.json");
}
