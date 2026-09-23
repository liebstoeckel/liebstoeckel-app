// The local half of `liebstoeckel dev --live`: keeps a deck folder and the
// deck's live document in step, both ways. Remote edits are written to the
// files (so HMR picks them up); local file changes become minimal text edits.
// Each file remembers the content last agreed between disk and document, so
// the mirror never echoes its own writes and can merge when both sides moved.

import { type Dirent, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as Y from "yjs";
import {
  type CheckpointRecord,
  MAX_SOURCE_BYTES,
  SKIP_DIRS,
  type SyncClient,
  checkpointList,
  deleteFile,
  filesMap,
  isSyncPath,
  mergeText,
  setFile,
} from "./sync.ts";

/** Origin of the mirror's own document changes. */
const LOCAL = Symbol("live-mirror");
const TOO_LARGE = Symbol("too-large");

export interface LiveMirrorOptions {
  dir: string;
  client: SyncClient;
  pollMs?: number;
  /** One line per remote change or notable event. */
  log?: (line: string) => void;
  onCheckpoint?: (record: CheckpointRecord) => void;
}

interface Seen {
  mtimeMs: number;
  size: number;
}

/** Deck-relative source paths under `dir` (forward slashes). */
export function listSourcePaths(dir: string): string[] {
  const out: string[] = [];
  const walk = (abs: string, rel: string) => {
    let entries: Dirent[];
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(join(abs, e.name), childRel);
      } else if (e.isFile() && isSyncPath(childRel)) {
        out.push(childRel);
      }
    }
  };
  walk(dir, "");
  return out.sort();
}

export class LiveMirror {
  private readonly agreed = new Map<string, string>();
  private readonly seen = new Map<string, Seen>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastLog = new Map<string, number>();
  private readonly warnedLarge = new Set<string>();
  private readonly doc;

  constructor(private readonly opts: LiveMirrorOptions) {
    this.doc = opts.client.doc;
  }

  /** Start mirroring. The folder and the document should already agree
   *  (the CLI catches up first); anything that differs is reconciled. */
  start(): void {
    const files = filesMap(this.doc);
    for (const [path, text] of files.entries()) this.agreed.set(path, text.toString());
    for (const path of new Set([...listSourcePaths(this.opts.dir), ...files.keys()])) this.sync(path, false);

    files.observeDeep((events, txn) => {
      if (txn.origin === LOCAL) return;
      const paths = new Set<string>();
      for (const event of events) {
        if (event instanceof Y.YMapEvent) for (const key of event.keysChanged) paths.add(key);
        else {
          const path = pathOf(files, event.target);
          if (path) paths.add(path);
        }
      }
      for (const path of paths) this.sync(path, true);
    });
    checkpointList(this.doc).observe((event) => {
      for (const item of event.changes.added) {
        for (const record of item.content.getContent() as CheckpointRecord[]) this.opts.onCheckpoint?.(record);
      }
    });
    this.timer = setInterval(() => this.poll(), this.opts.pollMs ?? 300);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Look for local changes: stat every source file, read the ones that moved. */
  poll(): void {
    const onDisk = new Set(listSourcePaths(this.opts.dir));
    for (const path of onDisk) {
      let st: Seen;
      try {
        const s = statSync(join(this.opts.dir, path));
        st = { mtimeMs: s.mtimeMs, size: s.size };
      } catch {
        continue;
      }
      const prev = this.seen.get(path);
      if (prev && prev.mtimeMs === st.mtimeMs && prev.size === st.size) continue;
      this.seen.set(path, st);
      this.sync(path, false);
    }
    for (const path of this.agreed.keys()) {
      if (!onDisk.has(path)) {
        this.seen.delete(path);
        this.sync(path, false);
      }
    }
  }

  /** File content, undefined when absent, or TOO_LARGE for a file over the
   *  cap, which is left alone rather than read as a deletion. */
  private readDisk(path: string): string | undefined | typeof TOO_LARGE {
    try {
      const abs = join(this.opts.dir, path);
      if (statSync(abs).size > MAX_SOURCE_BYTES) return TOO_LARGE;
      return readFileSync(abs, "utf8");
    } catch {
      return undefined;
    }
  }

  private writeDisk(path: string, content: string | undefined): void {
    const abs = join(this.opts.dir, path);
    if (content === undefined) {
      rmSync(abs, { force: true });
      this.seen.delete(path);
      return;
    }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    const s = statSync(abs);
    this.seen.set(path, { mtimeMs: s.mtimeMs, size: s.size });
  }

  private writeDoc(path: string, content: string | undefined): void {
    if (content === undefined) deleteFile(this.doc, path, LOCAL);
    else setFile(this.doc, path, content, LOCAL);
  }

  /** Reconcile one file, logging instead of crashing on a filesystem error
   *  (a remote path that collides with a local file, a permission problem). */
  private sync(path: string, remote: boolean): void {
    try {
      this.reconcile(path, remote);
    } catch (err) {
      this.opts.log?.(`${path}: not synced (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  /** Reconcile one file between disk, document and the last agreed content. */
  private reconcile(path: string, remote: boolean): void {
    if (!isSyncPath(path)) return;
    const disk = this.readDisk(path);
    if (disk === TOO_LARGE) {
      if (!this.warnedLarge.has(path)) {
        this.warnedLarge.add(path);
        this.opts.log?.(`${path}: over ${MAX_SOURCE_BYTES / 1024} KB, not synced`);
      }
      return;
    }
    const live = filesMap(this.doc).get(path)?.toString();
    const agreed = this.agreed.get(path);
    if (disk === live) {
      this.remember(path, disk);
      return;
    }
    if (disk === agreed) {
      // Only the document moved: take it.
      this.writeDisk(path, live);
      this.remember(path, live);
      if (remote) this.announce(path, live === undefined ? "deleted" : "changed");
      return;
    }
    if (live === agreed) {
      // Only the file moved: send it.
      this.writeDoc(path, disk);
      this.remember(path, disk);
      return;
    }
    // Both moved since they last agreed: merge, and let the local side win
    // where the same lines changed (the developer typed it last).
    let merged: string | undefined;
    if (disk !== undefined && live !== undefined) {
      // Where both changed the same lines the local side wins; every other
      // remote change is kept.
      const m = mergeText(agreed ?? "", disk, live, { preferOurs: true });
      merged = m.ok ? m.text : disk;
    } else {
      merged = disk ?? live;
    }
    if (merged !== disk) this.writeDisk(path, merged);
    if (merged !== live) this.writeDoc(path, merged);
    this.remember(path, merged);
    if (remote) this.announce(path, "merged");
  }

  private remember(path: string, content: string | undefined): void {
    if (content === undefined) this.agreed.delete(path);
    else this.agreed.set(path, content);
  }

  /** Name who is editing the file (from awareness), at most every 2 s per file. */
  private announce(path: string, what: string): void {
    const now = Date.now();
    if (now - (this.lastLog.get(path) ?? 0) < 2_000) return;
    this.lastLog.set(path, now);
    const names = new Set<string>();
    const self = this.opts.client.awareness.clientID;
    for (const [id, state] of this.opts.client.awareness.getStates()) {
      const s = state as { user?: { name?: string }; file?: string };
      if (id !== self && s.file === path && s.user?.name) names.add(s.user.name);
    }
    const who = names.size > 0 ? ` by ${[...names].join(", ")}` : " remotely";
    this.opts.log?.(`${path} ${what}${who}`);
  }
}

/** The path under which `target` (a Y.Text) is stored in the files map. */
function pathOf(files: ReturnType<typeof filesMap>, target: unknown): string | null {
  for (const [path, text] of files.entries()) if (text === target) return path;
  return null;
}
