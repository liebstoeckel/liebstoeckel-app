import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// The annotation store: one JSON file under the deck, a keyed map of independent,
// self-contained entries. The shape is deliberately map-of-values rather than an
// ordered array so a hosted variant can drop the same entries into a CRDT map
// without a schema change. All transitions are pure functions over the store
// value; only load/save touch the filesystem.

export type AnnotationStatus = "open" | "dispatched" | "applied" | "dismissed";

export interface AnnotationTargetHint {
  tag?: string;
  classes?: string[];
  text?: string;
}

export interface AnnotationComment {
  /** Viewport-relative position (0..1 of window width/height at capture time). */
  x: number;
  y: number;
  text: string;
  /** Light snapshot of the element under the point, a hint for the agent. */
  target?: AnnotationTargetHint;
}

export interface AnnotationStroke {
  /** Polyline of viewport-relative points. */
  points: Array<[number, number]>;
}

export interface AnnotationEntry {
  id: string;
  slide: {
    index: number;
    /** Deck-relative source file, resolved at annotation time; null when the
     *  entry parser could not attribute the slide (the agent still gets the
     *  deck dir and slide index). */
    sourceFile: string | null;
  };
  comments: AnnotationComment[];
  strokes: AnnotationStroke[];
  /** Screenshot file name under the dev screenshots dir, when captured. */
  screenshot: string | null;
  status: AnnotationStatus;
  /** Set when the entry was dispatched to an agent; groups a Send batch. */
  batchId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface AnnotationStore {
  version: 1;
  entries: Record<string, AnnotationEntry>;
}

export function emptyStore(): AnnotationStore {
  return { version: 1, entries: {} };
}

/** Insert or replace an entry. Returns a new store value. */
export function upsertEntry(store: AnnotationStore, entry: AnnotationEntry): AnnotationStore {
  return { ...store, entries: { ...store.entries, [entry.id]: entry } };
}

/** Transition the given entries; unknown ids are ignored. `batchId` is stamped
 *  when moving to `dispatched` and cleared when an entry returns to `open`. */
export function setStatus(
  store: AnnotationStore,
  ids: string[],
  status: AnnotationStatus,
  opts: { batchId?: string; now?: number } = {},
): AnnotationStore {
  const now = opts.now ?? Date.now();
  const entries = { ...store.entries };
  for (const id of ids) {
    const entry = entries[id];
    if (!entry) continue;
    entries[id] = {
      ...entry,
      status,
      batchId: status === "dispatched" ? (opts.batchId ?? entry.batchId) : status === "open" ? null : entry.batchId,
      updatedAt: now,
    };
  }
  return { ...store, entries };
}

export function entriesByStatus(store: AnnotationStore, status: AnnotationStatus, slideIndex?: number): AnnotationEntry[] {
  return Object.values(store.entries)
    .filter((entry) => entry.status === status && (slideIndex === undefined || entry.slide.index === slideIndex))
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

export function entriesInBatch(store: AnnotationStore, batchId: string): AnnotationEntry[] {
  return Object.values(store.entries)
    .filter((entry) => entry.batchId === batchId)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

/** Parse a persisted store, tolerating junk: a malformed file or wrong version
 *  yields an empty store rather than a crash (annotations are never worth
 *  wedging the dev server over). Individual malformed entries are dropped. */
export function parseStore(text: string): AnnotationStore {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return emptyStore();
  }
  if (!raw || typeof raw !== "object" || (raw as { version?: unknown }).version !== 1) return emptyStore();
  const entriesRaw = (raw as { entries?: unknown }).entries;
  if (!entriesRaw || typeof entriesRaw !== "object") return emptyStore();
  const entries: Record<string, AnnotationEntry> = {};
  for (const [id, value] of Object.entries(entriesRaw as Record<string, unknown>)) {
    const entry = value as Partial<AnnotationEntry> | null;
    if (!entry || typeof entry !== "object") continue;
    if (typeof entry.id !== "string" || entry.id !== id) continue;
    if (!entry.slide || typeof entry.slide.index !== "number") continue;
    if (!["open", "dispatched", "applied", "dismissed"].includes(entry.status as string)) continue;
    entries[id] = {
      id,
      slide: { index: entry.slide.index, sourceFile: entry.slide.sourceFile ?? null },
      comments: Array.isArray(entry.comments) ? entry.comments : [],
      strokes: Array.isArray(entry.strokes) ? entry.strokes : [],
      screenshot: typeof entry.screenshot === "string" ? entry.screenshot : null,
      status: entry.status as AnnotationStatus,
      batchId: typeof entry.batchId === "string" ? entry.batchId : null,
      createdAt: typeof entry.createdAt === "number" ? entry.createdAt : 0,
      updatedAt: typeof entry.updatedAt === "number" ? entry.updatedAt : 0,
    };
  }
  return { version: 1, entries };
}

export function serializeStore(store: AnnotationStore): string {
  return JSON.stringify(store, null, 2) + "\n";
}

// ---------------------------------------------------------------------------
// Filesystem layout + thin IO
// ---------------------------------------------------------------------------

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
