import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { devDir, screenshotsDir, serverInfoPath, storePath } from "./paths";
import type { DevBackend } from "./protocol";
import {
  SKIP_DIRS,
  batchesDispatchedAfter,
  listCreatedSources,
  listDeckFiles,
  listDeckSources,
  loadBatchSnapshot,
  pruneBatchSnapshots,
  removeBatchSnapshot,
  restoreSnapshot,
  saveBatchSnapshot,
  snapshotFiles,
  withinRoot,
} from "./snapshot";

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
      saveBatchSnapshot(deckDir, batchId, { files: snapshot, existed, dispatchedAt: Date.now() });
      pruneBatchSnapshots(deckDir, MAX_KEPT_SNAPSHOTS);
    },
    batchesAfter: (batchId) => batchesDispatchedAfter(deckDir, batchId),
    recordCreated: (batchId, files) => {
      const record = loadBatchSnapshot(deckDir, batchId);
      if (!record) return;
      const existed = record.existed ? new Set(record.existed) : null;
      let changed = false;
      for (const file of files) {
        const rel = withinRoot(deckDir, file);
        if (!rel || rel in record.files) continue;
        // Dependency, VCS, and dev-state dirs are outside the existence record,
        // so a reported path there would always look "created": never delete.
        if (SKIP_DIRS.has(rel.split(/[\\/]/)[0]!)) continue;
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
      if (!record) return null;
      const result = restoreSnapshot(deckDir, record.files);
      // Source files that did not exist at dispatch are the batch's own,
      // reported or not: an agent that gave up mid-batch replies with an
      // error and lists nothing, and a `done` reply may omit a file it
      // created. Leaving those behind would strand an orphan slide file (and
      // its numeric prefix) beside the restored entry.
      if (record.existed) {
        for (const rel of listCreatedSources(deckDir, record.existed)) {
          if (rel in record.files) continue;
          try {
            rmSync(join(deckDir, rel));
            result.restored.push(rel);
          } catch (err) {
            result.failures.push({ file: rel, message: err instanceof Error ? err.message : String(err) });
          }
        }
      }
      return result;
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

/** Remove server.json. With `pid`, only when the file is this process's own:
 *  a second server on the deck (or a fast restart) has since overwritten it,
 *  and deleting theirs would strand their `dev poll`. */
export function removeServerInfo(deckDir: string, pid?: number): void {
  const file = serverInfoPath(deckDir);
  try {
    if (pid !== undefined) {
      const raw = JSON.parse(readFileSync(file, "utf-8"));
      if (typeof raw?.pid === "number" && raw.pid !== pid) return;
    }
    rmSync(file);
  } catch {
    // already gone or unreadable
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
