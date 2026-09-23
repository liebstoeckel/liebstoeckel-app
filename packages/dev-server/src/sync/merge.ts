// Three-way merge for deck sources: per file (diff3 over lines) and per tree
// (a map of path to text). A merge either applies cleanly or reports where it
// conflicts. It never writes conflict markers: the live document only accepts
// clean merges, and a conflict is handed back to the Git side.

import { matchSequences, splitLines } from "./diff.ts";

/** A replaced range of base lines [baseStart, baseEnd) and its new lines. */
interface Hunk {
  baseStart: number;
  baseEnd: number;
  lines: string[];
}

export interface Conflict {
  /** Base line range (0-based, end exclusive) both sides changed differently. */
  baseStart: number;
  baseEnd: number;
}

export type TextMergeResult = { ok: true; text: string } | { ok: false; conflicts: Conflict[] };

function hunks(base: string[], other: string[]): Hunk[] {
  const out: Hunk[] = [];
  let bi = 0;
  let oi = 0;
  const gap = (baseEnd: number, otherEnd: number) => {
    if (bi === baseEnd && oi === otherEnd) return;
    out.push({ baseStart: bi, baseEnd, lines: other.slice(oi, otherEnd) });
  };
  for (const m of matchSequences(base, other)) {
    gap(m.aStart, m.bStart);
    bi = m.aStart + m.length;
    oi = m.bStart + m.length;
  }
  gap(base.length, other.length);
  return out;
}

/** Lines of `side` covering base [from, to), given that side's hunks. */
function render(base: string[], sideHunks: Hunk[], from: number, to: number): string[] {
  const out: string[] = [];
  let cursor = from;
  for (const h of sideHunks) {
    out.push(...base.slice(cursor, h.baseStart), ...h.lines);
    cursor = h.baseEnd;
  }
  out.push(...base.slice(cursor, to));
  return out;
}

/** diff3 over lines. Changes by one side apply; identical changes by both
 *  apply once; overlapping or adjacent different changes conflict (the same
 *  rule Git uses, so a push we refuse would also conflict for the developer),
 *  unless `preferOurs` resolves each such group to our side. */
export function mergeText(
  baseText: string,
  ours: string,
  theirs: string,
  opts: { preferOurs?: boolean } = {},
): TextMergeResult {
  if (ours === theirs) return { ok: true, text: ours };
  if (ours === baseText) return { ok: true, text: theirs };
  if (theirs === baseText) return { ok: true, text: ours };

  const base = splitLines(baseText);
  const tagged = [
    ...hunks(base, splitLines(ours)).map((h) => ({ ...h, side: 0 as const })),
    ...hunks(base, splitLines(theirs)).map((h) => ({ ...h, side: 1 as const })),
  ].sort((x, y) => x.baseStart - y.baseStart || x.baseEnd - y.baseEnd);

  const out: string[] = [];
  const conflicts: Conflict[] = [];
  let cursor = 0;
  let i = 0;
  while (i < tagged.length) {
    // Grow a group of hunks that overlap or touch.
    const group = [tagged[i]!];
    let start = tagged[i]!.baseStart;
    let end = tagged[i]!.baseEnd;
    i++;
    while (i < tagged.length && tagged[i]!.baseStart <= end) {
      const h = tagged[i]!;
      group.push(h);
      start = Math.min(start, h.baseStart);
      end = Math.max(end, h.baseEnd);
      i++;
    }
    out.push(...base.slice(cursor, start));
    const oursHunks = group.filter((h) => h.side === 0);
    const theirsHunks = group.filter((h) => h.side === 1);
    if (theirsHunks.length === 0) out.push(...render(base, oursHunks, start, end));
    else if (oursHunks.length === 0) out.push(...render(base, theirsHunks, start, end));
    else {
      const a = render(base, oursHunks, start, end);
      const b = render(base, theirsHunks, start, end);
      if (a.join("") === b.join("")) out.push(...a);
      // For a live mirror: keep our side only where both changed, and still
      // take every other hunk from theirs.
      else if (opts.preferOurs) out.push(...a);
      else conflicts.push({ baseStart: start, baseEnd: end });
    }
    cursor = end;
  }
  out.push(...base.slice(cursor));
  return conflicts.length > 0 ? { ok: false, conflicts } : { ok: true, text: out.join("") };
}

/** A deck source tree: deck-relative path to file text. */
export type FileTree = Record<string, string>;

export interface FileConflict {
  path: string;
  /** "content": both sides edited the same lines; "delete": one side deleted
   *  a file the other changed; "add": both added the path with different text. */
  kind: "content" | "delete" | "add";
  conflicts?: Conflict[];
}

export type TreeMergeResult = { ok: true; tree: FileTree } | { ok: false; conflicts: FileConflict[] };

/** Three-way merge of whole trees, file by file. */
export function mergeTrees(base: FileTree, ours: FileTree, theirs: FileTree): TreeMergeResult {
  const paths = new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)]);
  const tree: FileTree = {};
  const conflicts: FileConflict[] = [];
  for (const path of [...paths].sort()) {
    const b = base[path];
    const o = ours[path];
    const t = theirs[path];
    if (o === t) {
      if (o !== undefined) tree[path] = o;
      continue;
    }
    if (o === b) {
      if (t !== undefined) tree[path] = t;
      continue;
    }
    if (t === b) {
      if (o !== undefined) tree[path] = o;
      continue;
    }
    // Both sides changed the file, differently.
    if (o === undefined || t === undefined) {
      conflicts.push({ path, kind: "delete" });
      continue;
    }
    if (b === undefined) {
      conflicts.push({ path, kind: "add" });
      continue;
    }
    const merged = mergeText(b, o, t);
    if (merged.ok) tree[path] = merged.text;
    else conflicts.push({ path, kind: "content", conflicts: merged.conflicts });
  }
  return conflicts.length > 0 ? { ok: false, conflicts } : { ok: true, tree };
}
