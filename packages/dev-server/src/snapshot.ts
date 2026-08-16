import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { snapshotsDir } from "./store";

// Pre-dispatch source snapshots back the drawer's one-click Revert: before an
// apply batch is delivered, the referenced slide sources are copied here; revert
// restores them byte-for-byte and HMR shows the rollback. Snapshots persist to
// disk so revert survives a dev-server restart. Git backstops anything older.

export interface FileSnapshot {
  exists: boolean;
  content: string;
}

export type BatchSnapshot = Record<string, FileSnapshot>;

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
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, before.content, "utf-8");
      } else if (existsSync(abs)) {
        rmSync(abs);
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

export function saveBatchSnapshot(deckDir: string, batchId: string, snapshot: BatchSnapshot): void {
  const file = batchPath(deckDir, batchId);
  if (!file) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");
}

export function loadBatchSnapshot(deckDir: string, batchId: string): BatchSnapshot | null {
  const file = batchPath(deckDir, batchId);
  if (!file || !existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf-8"));
    return raw && typeof raw === "object" ? (raw as BatchSnapshot) : null;
  } catch {
    return null;
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
