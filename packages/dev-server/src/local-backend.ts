import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { devDir, screenshotsDir, serverInfoPath, storePath } from "./paths";
import type { DevBackend } from "./protocol";
import { loadBatchSnapshot, removeBatchSnapshot, restoreSnapshot, saveBatchSnapshot, snapshotFiles, withinRoot } from "./snapshot";
import { findEntryFile, resolveSlideFiles } from "./slides";
import { type AnnotationStore, emptyStore, parseStore, serializeStore } from "./store";

// The filesystem backend behind the local `liebstoeckel dev` protocol: a JSON
// store and PNG screenshots under `.liebstoeckel/dev/`, per-batch source
// snapshots for revert, the per-boot token as the only credential, and slide
// resolution from the deck's entry file. Everything that touches disk or the
// CLI package for the /__dev protocol is in here, so the protocol module
// itself stays importable from hosts that have neither.

export function loadStore(deckDir: string): AnnotationStore {
  const file = storePath(deckDir);
  if (!existsSync(file)) return emptyStore();
  return parseStore(readFileSync(file, "utf-8"));
}

export function saveStore(deckDir: string, store: AnnotationStore): void {
  const file = storePath(deckDir);
  mkdirSync(dirname(file), { recursive: true });
  // Write-then-rename so a crash mid-write never leaves a truncated store.
  writeFileSync(file + ".tmp", serializeStore(store), "utf-8");
  renameSync(file + ".tmp", file);
}

export interface LocalBackendOptions {
  deckDir: string;
  token: string;
  onStop?: () => void;
}

export function createLocalBackend(opts: LocalBackendOptions): DevBackend {
  const { deckDir, token } = opts;
  return {
    deckDir,
    authorize: (url, body) => (body?.token ?? url.searchParams.get("token")) === token,
    loadStore: () => loadStore(deckDir),
    saveStore: (store) => saveStore(deckDir, store),
    resolveSlides: () => resolveSlideFiles(deckDir),
    entryFile: () => findEntryFile(deckDir),
    writeScreenshot: (id, bytes) => {
      const dir = screenshotsDir(deckDir);
      mkdirSync(dir, { recursive: true });
      const name = `${id}.png`;
      writeFileSync(join(dir, name), bytes);
      return name;
    },
    screenshotRef: (name) => join(screenshotsDir(deckDir), name),
    takeSnapshot: (batchId, files) => saveBatchSnapshot(deckDir, batchId, snapshotFiles(deckDir, files)),
    recordCreated: (batchId, files) => {
      const snapshot = loadBatchSnapshot(deckDir, batchId);
      if (!snapshot) return;
      let changed = false;
      for (const file of files) {
        const rel = withinRoot(deckDir, file);
        if (!rel || rel in snapshot) continue;
        // Not in the snapshot = not referenced at dispatch; the agent reports
        // only files it touched, so treat it as created (revert deletes it).
        snapshot[rel] = { exists: false, content: "" };
        changed = true;
      }
      if (changed) saveBatchSnapshot(deckDir, batchId, snapshot);
    },
    restoreSnapshot: (batchId) => {
      const snapshot = loadBatchSnapshot(deckDir, batchId);
      return snapshot ? restoreSnapshot(deckDir, snapshot) : null;
    },
    removeSnapshot: (batchId) => removeBatchSnapshot(deckDir, batchId),
    onStop: opts.onStop,
  };
}

// ---------------------------------------------------------------------------
// server.json: how `dev poll` and the loader find a running server
// ---------------------------------------------------------------------------

export function writeServerInfo(deckDir: string, info: { port: number; token: string }): void {
  mkdirSync(devDir(deckDir), { recursive: true });
  const full = { ...info, pid: process.pid, startedAt: new Date().toISOString() };
  writeFileSync(serverInfoPath(deckDir), JSON.stringify(full, null, 2) + "\n", "utf-8");
}

export function removeServerInfo(deckDir: string): void {
  try {
    rmSync(serverInfoPath(deckDir));
  } catch {
    // already gone
  }
}

export function readServerInfo(deckDir: string): { port: number; token: string } | null {
  const file = serverInfoPath(deckDir);
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf-8"));
    if (typeof raw?.port === "number" && typeof raw?.token === "string") return { port: raw.port, token: raw.token };
  } catch {
    // fall through
  }
  return null;
}

/** Keep `.liebstoeckel/dev/` out of the deck's git history: server.json holds
 *  the session token and screenshots/snapshots are working state. */
export function ensureDevGitignore(deckDir: string): void {
  const file = join(devDir(deckDir), ".gitignore");
  try {
    mkdirSync(dirname(file), { recursive: true });
    if (!existsSync(file)) writeFileSync(file, "server.json\nscreenshots/\nsnapshots/\n", "utf-8");
  } catch {
    // best-effort
  }
}
