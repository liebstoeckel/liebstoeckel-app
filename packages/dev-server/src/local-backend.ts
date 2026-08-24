import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { devDir, screenshotsDir, serverInfoPath, storePath } from "./paths";
import type { DevBackend } from "./protocol";
import { listDeckFiles, listDeckSources, loadBatchSnapshot, pruneBatchSnapshots, removeBatchSnapshot, restoreSnapshot, saveBatchSnapshot, snapshotFiles, withinRoot } from "./snapshot";

/** Whole-tree revert snapshots kept on disk; older ones are pruned on each
 *  dispatch (their Revert falls back to git). */
const MAX_KEPT_SNAPSHOTS = 10;
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
    takeSnapshot: (batchId, files) => {
      // The referenced files plus every text source in the deck: attribution
      // is best-effort and the agent may edit shared code, so only the whole
      // source tree makes revert safe. The file list doubles as the existence
      // record that decides what revert may delete.
      const existed = listDeckFiles(deckDir);
      const snapshot = snapshotFiles(deckDir, [...files, ...listDeckSources(deckDir, existed)]);
      saveBatchSnapshot(deckDir, batchId, { files: snapshot, existed });
      pruneBatchSnapshots(deckDir, MAX_KEPT_SNAPSHOTS);
    },
    recordCreated: (batchId, files) => {
      const record = loadBatchSnapshot(deckDir, batchId);
      if (!record) return;
      const existed = record.existed ? new Set(record.existed) : null;
      let changed = false;
      for (const file of files) {
        const rel = withinRoot(deckDir, file);
        if (!rel || rel in record.files) continue;
        // Only a file that provably did not exist at dispatch is "created"
        // (revert deletes it). One that existed but was not snapshotted (binary,
        // oversized, or a batch without an existence record) is left alone
        // rather than destroyed.
        if (!existed || existed.has(rel)) continue;
        record.files[rel] = { exists: false, content: "" };
        changed = true;
      }
      if (changed) saveBatchSnapshot(deckDir, batchId, record);
    },
    restoreSnapshot: (batchId) => {
      const record = loadBatchSnapshot(deckDir, batchId);
      return record ? restoreSnapshot(deckDir, record.files) : null;
    },
    removeSnapshot: (batchId) => removeBatchSnapshot(deckDir, batchId),
    onStop: opts.onStop,
  };
}

// ---------------------------------------------------------------------------
// server.json: how `dev poll` and the loader find a running server
// ---------------------------------------------------------------------------

export interface ServerInfo {
  port: number;
  token: string;
  /** The interface the server bound; `dev poll` dials it (loopback when absent). */
  hostname?: string;
}

export function writeServerInfo(deckDir: string, info: ServerInfo): void {
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

export function readServerInfo(deckDir: string): ServerInfo | null {
  const file = serverInfoPath(deckDir);
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf-8"));
    if (typeof raw?.port === "number" && typeof raw?.token === "string") {
      return { port: raw.port, token: raw.token, ...(typeof raw.hostname === "string" ? { hostname: raw.hostname } : {}) };
    }
  } catch {
    // fall through
  }
  return null;
}

/** Keep `.liebstoeckel/dev/` out of the deck's git history: server.json holds
 *  the session token and screenshots/snapshots are working state. */
export function ensureDevGitignore(deckDir: string): void {
  const file = join(devDir(deckDir), ".gitignore");
  const wanted = ["server.json", "annotations.json", "screenshots/", "snapshots/"];
  try {
    mkdirSync(dirname(file), { recursive: true });
    if (!existsSync(file)) {
      writeFileSync(file, wanted.join("\n") + "\n", "utf-8");
      return;
    }
    // A file from an earlier version may miss entries added since (e.g.
    // annotations.json); append what is missing, never rewrite user edits.
    const current = readFileSync(file, "utf-8");
    const lines = new Set(current.split("\n").map((l) => l.trim()));
    const missing = wanted.filter((w) => !lines.has(w));
    if (missing.length > 0) writeFileSync(file, current.replace(/\n?$/, "\n") + missing.join("\n") + "\n", "utf-8");
  } catch {
    // best-effort
  }
}
