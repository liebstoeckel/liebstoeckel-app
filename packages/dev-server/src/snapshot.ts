import { type Dirent, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { snapshotsDir } from "./paths";

// Pre-dispatch source snapshots back the drawer's one-click Revert: before an
// apply batch is delivered, the deck's text sources are copied here (slide
// attribution is best-effort and the agent may touch shared components or the
// entry, so the whole source tree is the only safe unit); revert restores them
// byte-for-byte and HMR shows the rollback. A batch also records which files
// existed at dispatch, so a file the agent reports that was not snapshotted is
// only ever deleted on revert when it provably did not exist before. Snapshots
// persist to disk so revert survives a dev-server restart. Git backstops
// anything older.

export interface FileSnapshot {
  exists: boolean;
  content: string;
}

export type BatchSnapshot = Record<string, FileSnapshot>;

/** What a batch persists: file contents to restore plus the deck-relative
 *  paths of every file that existed at dispatch (`existed` is null for batches
 *  written before it was recorded; those never delete on revert). */
export interface BatchRecord {
  files: BatchSnapshot;
  existed: string[] | null;
  /** Epoch-ms of the dispatch; absent on records written before it was kept
   *  (those cannot be ordered, so a revert never reopens them). */
  dispatchedAt?: number;
}

/** Directories never snapshotted, listed, or deleted on revert. */
export const SKIP_DIRS = new Set(["node_modules", ".git", ".liebstoeckel", "dist", "build", "out", ".cache"]);
const SOURCE_EXTS = new Set([".mdx", ".md", ".tsx", ".ts", ".jsx", ".js", ".mjs", ".css", ".json", ".html", ".svg", ".toml", ".yaml", ".yml", ".txt"]);
const MAX_SOURCE_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

/** Every file under the deck (deck-relative, forward slashes), skipping
 *  dependency, build, VCS, and dev-state directories. */
export function listDeckFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, rel: string) => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), childRel);
      } else if (entry.isFile()) {
        out.push(childRel);
      }
    }
  };
  walk(resolve(root), "");
  return out.sort();
}

/** The text sources worth snapshotting for revert: known authoring extensions
 *  under a per-file and total size cap, so a deck with large assets still
 *  snapshots quickly. */
export function listDeckSources(root: string, all: string[] = listDeckFiles(root)): string[] {
  const picked: string[] = [];
  let total = 0;
  for (const rel of all) {
    const ext = rel.slice(rel.lastIndexOf(".")).toLowerCase();
    if (!SOURCE_EXTS.has(ext)) continue;
    let size: number;
    try {
      size = statSync(join(root, rel)).size;
    } catch {
      continue;
    }
    if (size > MAX_SOURCE_BYTES || total + size > MAX_TOTAL_BYTES) continue;
    total += size;
    picked.push(rel);
  }
  return picked;
}

/** Deck-relative and inside the deck root, or null. The traversal guard for
 *  everything file-shaped that crosses the dev protocol. */
export function withinRoot(root: string, file: string): string | null {
  if (typeof file !== "string" || !file) return null;
  const abs = isAbsolute(file) ? file : resolve(root, file);
  const rel = relative(resolve(root), abs);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
  return rel;
}

export function snapshotFiles(root: string, files: string[]): BatchSnapshot {
  const snapshot: BatchSnapshot = {};
  for (const file of files) {
    const rel = withinRoot(root, file);
    if (!rel || rel in snapshot) continue;
    const abs = join(root, rel);
    try {
      snapshot[rel] = existsSync(abs)
        ? { exists: true, content: readFileSync(abs, "utf-8") }
        : { exists: false, content: "" };
    } catch {
      // Unreadable before dispatch: leave it out rather than restore garbage later.
    }
  }
  return snapshot;
}

export interface RestoreResult {
  /** Files written or removed; files already at their snapshot content are left untouched. */
  restored: string[];
  failures: Array<{ file: string; message: string }>;
}

export function restoreSnapshot(root: string, snapshot: BatchSnapshot): RestoreResult {
  const restored: string[] = [];
  const failures: RestoreResult["failures"] = [];
  for (const [file, before] of Object.entries(snapshot)) {
    const rel = withinRoot(root, file);
    if (!rel) continue;
    const abs = join(root, rel);
    try {
      if (before.exists) {
        // Whole-tree snapshots mean most files are unchanged; skip those so
        // revert does not rewrite (and hot-reload) the entire deck.
        if (existsSync(abs) && readFileSync(abs, "utf-8") === before.content) continue;
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, before.content, "utf-8");
      } else if (existsSync(abs)) {
        rmSync(abs);
      } else {
        continue;
      }
      restored.push(rel);
    } catch (err) {
      failures.push({ file: rel, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return { restored, failures };
}

// ---------------------------------------------------------------------------
// Per-batch persistence
// ---------------------------------------------------------------------------

function batchPath(deckDir: string, batchId: string): string | null {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(batchId)) return null;
  return join(snapshotsDir(deckDir), `${batchId}.json`);
}

export function saveBatchSnapshot(deckDir: string, batchId: string, record: BatchRecord): void {
  const file = batchPath(deckDir, batchId);
  if (!file) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ version: 2, ...record }, null, 2) + "\n", "utf-8");
}

export function loadBatchSnapshot(deckDir: string, batchId: string): BatchRecord | null {
  const file = batchPath(deckDir, batchId);
  if (!file || !existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf-8"));
    if (!raw || typeof raw !== "object") return null;
    if (raw.version === 2 && raw.files && typeof raw.files === "object") {
      return {
        files: raw.files as BatchSnapshot,
        existed: Array.isArray(raw.existed) ? (raw.existed as string[]) : null,
        ...(typeof raw.dispatchedAt === "number" ? { dispatchedAt: raw.dispatchedAt } : {}),
      };
    }
    // Pre-manifest format: a flat file map. No existence record, so revert
    // restores but never deletes for these.
    return { files: raw as BatchSnapshot, existed: null };
  } catch {
    return null;
  }
}

/** Ids of the batches dispatched after `batchId` (by recorded dispatch time).
 *  Empty when either side has no dispatch time. */
export function batchesDispatchedAfter(deckDir: string, batchId: string): string[] {
  const me = loadBatchSnapshot(deckDir, batchId);
  if (me?.dispatchedAt === undefined) return [];
  const since = me.dispatchedAt;
  let names: string[];
  try {
    names = readdirSync(snapshotsDir(deckDir)).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
  const later: Array<{ id: string; at: number }> = [];
  for (const name of names) {
    const id = name.slice(0, -".json".length);
    if (id === batchId) continue;
    const record = loadBatchSnapshot(deckDir, id);
    if (record?.dispatchedAt !== undefined && record.dispatchedAt > since) later.push({ id, at: record.dispatchedAt });
  }
  return later.sort((a, b) => a.at - b.at).map((entry) => entry.id);
}

/** Cap the snapshot store: whole-tree snapshots are written on every dispatch
 *  and only revert removes one, so an unpruned long session grows without
 *  bound. Keeps the `keep` newest records (by mtime); a pruned batch simply
 *  loses its Revert (git backstops anything older). */
export function pruneBatchSnapshots(deckDir: string, keep: number): void {
  const dir = snapshotsDir(deckDir);
  let entries: Array<{ path: string; mtime: number }>;
  try {
    entries = readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => {
        const path = join(dir, name);
        return { path, mtime: statSync(path).mtimeMs };
      });
  } catch {
    return;
  }
  entries.sort((a, b) => b.mtime - a.mtime);
  for (const entry of entries.slice(Math.max(0, keep))) {
    try {
      rmSync(entry.path);
    } catch {
      // best-effort
    }
  }
}

export function removeBatchSnapshot(deckDir: string, batchId: string): void {
  const file = batchPath(deckDir, batchId);
  if (!file) return;
  try {
    rmSync(file);
  } catch {
    // best-effort cleanup
  }
}
