// Live source sync for a local deck folder: the sync state file, catching up
// with the live document (`pull`), uploading local work (`push --source`),
// and committing others' edits with their names (`sync commit`). Shared by the
// cloud commands and `liebstoeckel dev --live`.

import { type Dirent, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import {
  type CheckpointRecord,
  type FileConflict,
  type FileTree,
  MAX_SOURCE_BYTES,
  SKIP_DIRS,
  isSyncPath,
  mergeTrees,
} from "@liebstoeckel/dev-server/sync";
import { loadCreds } from "./creds";

// ---- sync state -------------------------------------------------------------

export interface SyncState {
  deckId: string;
  api: string;
  org?: string;
  /** The checkpoint the local files were last in sync with: the merge base. */
  base: string | null;
  /** The checkpoint whose authors were last credited by `sync commit`. */
  committed: string | null;
  /** Set when `pull` left conflict markers: the checkpoint they merged in. */
  pending?: string | null;
}

export const syncStatePath = (deckDir: string) => join(deckDir, ".liebstoeckel", "sync.json");

export function readSyncState(deckDir: string): SyncState | null {
  try {
    return JSON.parse(readFileSync(syncStatePath(deckDir), "utf8")) as SyncState;
  } catch {
    return null;
  }
}

export function writeSyncState(deckDir: string, state: SyncState): void {
  const path = syncStatePath(deckDir);
  mkdirSync(dirname(path), { recursive: true });
  // The whole folder is local dev state; keep it out of the developer's repo.
  const ignore = join(dirname(path), ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, "*\n");
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}

// ---- local files --------------------------------------------------------------

/** The deck folder's source files, by the same rules the server applies. A
 *  source file over the size cap is an error, never left out: leaving it out
 *  would read as a deletion and remove it from the live deck. */
export function readLocalTree(deckDir: string): FileTree {
  const tree: FileTree = {};
  const tooLarge: string[] = [];
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
        const text = readFileSync(join(abs, e.name), "utf8");
        if (new TextEncoder().encode(text).length > MAX_SOURCE_BYTES) tooLarge.push(childRel);
        else tree[childRel] = text;
      }
    }
  };
  walk(deckDir, "");
  if (tooLarge.length > 0) {
    throw new SyncError(`source files over ${MAX_SOURCE_BYTES / 1024} KB cannot be synced: ${tooLarge.join(", ")}`);
  }
  return tree;
}

/** Only safe source paths, whatever a server sent. */
export function safeTree(tree: FileTree): FileTree {
  return Object.fromEntries(Object.entries(tree).filter(([p, t]) => isSyncPath(p) && typeof t === "string"));
}

/** The absolute path for a deck-relative path, refusing anything that would
 *  land outside the deck folder. */
function insideDeck(deckDir: string, path: string): string {
  const root = resolve(deckDir);
  const abs = resolve(root, path);
  if (!isSyncPath(path) || !abs.startsWith(root + sep)) throw new SyncError(`refusing to write outside the deck: ${path}`);
  // A symlinked folder (or file) on the way would lead outside the deck.
  let at = root;
  for (const segment of path.split("/")) {
    at = join(at, segment);
    try {
      if (lstatSync(at).isSymbolicLink()) throw new SyncError(`refusing to write through a symlink: ${path}`);
    } catch (err) {
      if (err instanceof SyncError) throw err;
      break; // does not exist yet: nothing below it can be a symlink
    }
  }
  return abs;
}

/** Write the differences between `from` (what is on disk) and `to`. */
export function writeTreeChanges(deckDir: string, from: FileTree, to: FileTree): string[] {
  const touched: string[] = [];
  for (const path of Object.keys(from)) {
    if (!(path in to)) {
      rmSync(insideDeck(deckDir, path), { force: true });
      touched.push(path);
    }
  }
  for (const [path, content] of Object.entries(to)) {
    if (from[path] === content) continue;
    const abs = insideDeck(deckDir, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    touched.push(path);
  }
  return touched.sort();
}

export function sameTree(a: FileTree, b: FileTree): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}

const MARKER = /^(<{7}|={7}|>{7})( |$)/m;

/** Files that still hold conflict markers. */
export function filesWithMarkers(tree: FileTree): string[] {
  return Object.keys(tree).filter((p) => MARKER.test(tree[p]!)).sort();
}

// ---- planning a pull (pure) -----------------------------------------------------

export type PullPlan =
  | { kind: "in-sync" }
  | { kind: "merged"; tree: FileTree; writeLocal: boolean; upload: boolean }
  | { kind: "conflict"; tree: FileTree; conflicts: FileConflict[] };

const omit = (tree: FileTree, paths: Set<string>): FileTree =>
  Object.fromEntries(Object.entries(tree).filter(([p]) => !paths.has(p)));

/** Decide how local files and the live files come together, given the base
 *  they last agreed on. On conflict, `tree` holds everything that merged plus
 *  the local version of each conflicting file (the caller adds markers). */
export function planPull(base: FileTree, local: FileTree, live: FileTree): PullPlan {
  if (sameTree(local, live)) return { kind: "in-sync" };
  const merged = mergeTrees(base, local, live);
  if (merged.ok) {
    return {
      kind: "merged",
      tree: merged.tree,
      writeLocal: !sameTree(merged.tree, local),
      upload: !sameTree(merged.tree, live),
    };
  }
  const conflicted = new Set(merged.conflicts.map((c) => c.path));
  const rest = mergeTrees(omit(base, conflicted), omit(local, conflicted), omit(live, conflicted));
  const tree: FileTree = rest.ok ? { ...rest.tree } : { ...omit(local, conflicted) };
  for (const path of conflicted) {
    const keep = local[path] ?? live[path];
    if (keep !== undefined) tree[path] = keep;
  }
  return { kind: "conflict", tree, conflicts: merged.conflicts };
}

/** `git merge-file` output with conflict markers for one file. */
export async function withMarkers(base: string, local: string, live: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "liebstoeckel-merge-"));
  try {
    const [l, b, r] = ["local", "base", "live"].map((n) => join(dir, n));
    await Promise.all([writeFile(l!, local), writeFile(b!, base), writeFile(r!, live)]);
    const proc = Bun.spawn(["git", "merge-file", "-p", "-L", "local", "-L", "base", "-L", "live", l!, b!, r!], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = await new Response(proc.stdout).text();
    const code = await proc.exited;
    // The exit code is the number of conflicts (capped at 127); above that,
    // merge-file failed and printed nothing usable. Never write that over a file.
    if (code > 127 || (out === "" && (local !== "" || live !== ""))) {
      throw new SyncError(`git merge-file failed (${code}): ${(await new Response(proc.stderr).text()).trim()}`);
    }
    return out;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ---- talking to the control plane and the sync service ---------------------------

export interface Cloud {
  api: string;
  token: string;
  org?: string;
}

export interface SyncAccess {
  url: string;
  wsUrl: string;
  grant: string;
  role: "edit" | "read";
  expiresAt: number;
}

export class SyncError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

export async function cloudFromCreds(args: { api?: string; org?: string }, state?: SyncState | null): Promise<Cloud | null> {
  const creds = await loadCreds();
  if (!creds) return null;
  const api = (args.api ?? state?.api ?? creds.api ?? "").replace(/\/+$/, "");
  if (!api) return null;
  return { api, token: creds.token, org: args.org ?? state?.org ?? creds.org };
}

/** Get (or with `enable`, first turn on) live-source access for a deck. */
export async function sourceAccess(cloud: Cloud, deckId: string, enable: boolean): Promise<SyncAccess> {
  const headers: Record<string, string> = { authorization: `Bearer ${cloud.token}` };
  if (cloud.org) headers["x-org-slug"] = cloud.org;
  const res = await fetch(`${cloud.api}/api/v1/decks/${encodeURIComponent(deckId)}/source`, {
    method: enable ? "POST" : "GET",
    headers,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new SyncError(body.error ?? `source access failed (${res.status})`, res.status);
  }
  return (await res.json()) as SyncAccess;
}

async function syncCall<T>(access: SyncAccess, path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  const res = await fetch(`${access.url}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${access.grant}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, body };
}

export interface LiveFiles {
  commit: string | null;
  files: FileTree;
}

/** Files at `commit`, or the live files. For the live files the server first
 *  checkpoints pending edits, so `commit` names exactly the returned files. */
export async function fetchFiles(access: SyncAccess, commit?: string): Promise<LiveFiles> {
  const q = commit ? `?commit=${encodeURIComponent(commit)}` : "?checkpoint=1";
  const { status, body } = await syncCall<LiveFiles & { error?: string }>(access, `/files${q}`);
  if (status !== 200) throw new SyncError(body.error ?? `could not read files (${status})`, status);
  return { commit: body.commit, files: safeTree(body.files ?? {}) };
}

export async function fetchHistory(access: SyncAccess): Promise<CheckpointRecord[]> {
  const { status, body } = await syncCall<{ checkpoints: CheckpointRecord[] }>(access, "/history");
  if (status !== 200) throw new SyncError(`could not read history (${status})`, status);
  return body.checkpoints;
}

export type ImportOutcome =
  | { ok: true; commit: string; changed: boolean }
  | { ok: false; conflicts: FileConflict[]; head: string | null };

export async function importFiles(access: SyncAccess, base: string | null, files: FileTree, message?: string): Promise<ImportOutcome> {
  const { status, body } = await syncCall<ImportOutcome & { reason?: string; message?: string; error?: string }>(access, "/import", {
    method: "POST",
    body: JSON.stringify({ base, files, message }),
  });
  if (status === 200) return body;
  if (status === 409) return { ok: false, conflicts: (body as { conflicts: FileConflict[] }).conflicts, head: (body as { head: string | null }).head };
  throw new SyncError(body.message ?? body.error ?? `import failed (${status})`, status);
}

export async function saveCheckpoint(access: SyncAccess, message?: string): Promise<string | null> {
  const { status, body } = await syncCall<{ commit: string | null }>(access, "/checkpoint", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
  if (status !== 200) throw new SyncError(`could not save a version (${status})`, status);
  return body.commit;
}

// ---- the operations ------------------------------------------------------------------

export interface PullResult {
  kind: "in-sync" | "pulled" | "merged" | "conflict";
  written: string[];
  conflicts: FileConflict[];
  head: string | null;
}

/** Bring local files and the live deck together. */
export async function pullDeck(deckDir: string, state: SyncState, access: SyncAccess): Promise<PullResult> {
  const local = readLocalTree(deckDir);
  const marked = filesWithMarkers(local);
  if (marked.length > 0) {
    throw new SyncError(`resolve the conflict markers first: ${marked.join(", ")}`);
  }
  // A resolved conflict: the local files now contain what `pending` brought.
  const baseCommit = state.pending ?? state.base;
  const live = await fetchFiles(access);
  const base = baseCommit ? (await fetchFiles(access, baseCommit)).files : {};
  const plan = planPull(base, local, live.files);

  if (plan.kind === "in-sync") {
    writeSyncState(deckDir, { ...state, base: live.commit, pending: null });
    return { kind: "in-sync", written: [], conflicts: [], head: live.commit };
  }
  if (plan.kind === "merged") {
    const written = plan.writeLocal ? writeTreeChanges(deckDir, local, plan.tree) : [];
    let head = live.commit;
    if (plan.upload) {
      const imported = await importFiles(access, live.commit, plan.tree, "Merge local changes");
      if (!imported.ok) {
        // The live deck moved while we merged; the next pull picks it up.
        writeSyncState(deckDir, { ...state, base: baseCommit, pending: null });
        return { kind: "conflict", written, conflicts: imported.conflicts, head: imported.head };
      }
      head = imported.commit;
    }
    writeSyncState(deckDir, { ...state, base: head, pending: null });
    return { kind: plan.upload ? "merged" : "pulled", written, conflicts: [], head };
  }

  // Conflicts: write everything that merged, plus markers where it did not.
  const tree = { ...plan.tree };
  for (const c of plan.conflicts) {
    // Both sides edited, or both added the file: markers show both versions.
    // A delete against an edit keeps the edited file; deleting it again and
    // pushing is how the deletion wins.
    if (c.kind === "content" || c.kind === "add") {
      tree[c.path] = await withMarkers(base[c.path] ?? "", local[c.path] ?? "", live.files[c.path] ?? "");
    }
  }
  const written = writeTreeChanges(deckDir, local, tree);
  writeSyncState(deckDir, { ...state, pending: live.commit });
  return { kind: "conflict", written, conflicts: plan.conflicts, head: live.commit };
}

/** Upload local files as an import based on the last synced checkpoint. */
export async function pushSourceFiles(deckDir: string, state: SyncState, access: SyncAccess, message?: string): Promise<ImportOutcome> {
  const local = readLocalTree(deckDir);
  const marked = filesWithMarkers(local);
  if (marked.length > 0) throw new SyncError(`resolve the conflict markers first: ${marked.join(", ")}`);
  const outcome = await importFiles(access, state.pending ?? state.base, local, message);
  if (outcome.ok) {
    // The first push links the folder: what it uploaded is already in the
    // developer's history, so it is also where `sync commit` starts crediting.
    const first = state.base === null && state.committed === null;
    writeSyncState(deckDir, { ...state, base: outcome.commit, pending: null, committed: first ? outcome.commit : state.committed });
  }
  return outcome;
}

// ---- git: status and attributed commits -------------------------------------------------

async function git(deckDir: string, args: string[], stdin?: string): Promise<{ code: number; out: string; err: string }> {
  const proc = Bun.spawn(["git", "-C", deckDir, ...args], {
    stdin: stdin === undefined ? "ignore" : new Blob([stdin]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, out, err };
}

/** Checkpoints after `from` up to and including `to` (oldest first). */
export function checkpointsBetween(history: CheckpointRecord[], from: string | null, to: string | null): CheckpointRecord[] {
  const end = to ? history.findIndex((c) => c.commit === to) : history.length - 1;
  if (end < 0) return [];
  const start = from ? history.findIndex((c) => c.commit === from) + 1 : 0;
  return history.slice(Math.max(0, start), end + 1);
}

/** The commit message crediting everyone in `checkpoints` except `self`. */
export function attributedMessage(checkpoints: CheckpointRecord[], selfEmail: string | null, subject = "Live edits from liebstoeckel"): string {
  const seen = new Map<string, string>();
  for (const c of checkpoints) {
    for (const a of c.authors) {
      const key = a.email.toLowerCase();
      if (selfEmail && key === selfEmail.toLowerCase()) continue;
      if (key === "checkpoints@liebstoeckel.app") continue;
      const clean = (v: string) => v.replace(/[<>\r\n\0]/g, "").trim();
      if (!seen.has(key)) seen.set(key, `${clean(a.name)} <${clean(a.email)}>`);
    }
  }
  const trailers = [...seen.values()].map((v) => `Co-authored-by: ${v}`);
  return trailers.length > 0 ? `${subject}\n\n${trailers.join("\n")}\n` : `${subject}\n`;
}

export interface SyncCommitResult {
  committed: boolean;
  message: string;
  checkpoint: string | null;
}

/** Commit the deck folder, crediting the other editors since the last `sync commit`. */
export async function syncCommit(deckDir: string, state: SyncState, access: SyncAccess): Promise<SyncCommitResult> {
  const inRepo = await git(deckDir, ["rev-parse", "--is-inside-work-tree"]);
  if (inRepo.code !== 0) throw new SyncError("not inside a Git repository");
  // When the folder matches the live deck, save a version first so edits
  // since the last checkpoint are credited too.
  let upTo = state.base;
  const live = await fetchFiles(access);
  if (sameTree(readLocalTree(deckDir), live.files) && access.role === "edit") {
    upTo = (await saveCheckpoint(access, "Save version for a local commit")) ?? upTo;
  }
  const history = await fetchHistory(access);
  const email = (await git(deckDir, ["config", "user.email"])).out.trim() || null;
  const message = attributedMessage(checkpointsBetween(history, state.committed, upTo), email);
  await git(deckDir, ["add", "-A", "--", "."]);
  const staged = await git(deckDir, ["diff", "--cached", "--quiet", "--", "."]);
  if (staged.code === 0) {
    writeSyncState(deckDir, { ...state, base: upTo, committed: upTo });
    return { committed: false, message, checkpoint: upTo };
  }
  // Only the deck folder: anything else the developer staged stays staged.
  const commit = await git(deckDir, ["commit", "-q", "-F", "-", "--", "."], message);
  if (commit.code !== 0) throw new SyncError(`git commit failed: ${commit.err.trim()}`);
  writeSyncState(deckDir, { ...state, base: upTo, committed: upTo });
  return { committed: true, message, checkpoint: upTo };
}
