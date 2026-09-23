// Line and text diffing for deck sync. Pure: no Bun, no Node, no Yjs, so the
// dashboard's editor, the CLI mirror and the sync server all share it.

/** One edit against the old text: at `index` (in the old text), delete
 *  `remove` characters and insert `insert`. A list of edits is sorted by index
 *  and non-overlapping. */
export interface TextEdit {
  index: number;
  remove: number;
  insert: string;
}

/** Split into lines, keeping each line's terminator so joining is lossless. */
export function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      lines.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length) lines.push(text.slice(start));
  return lines;
}

/** A matched run: `a[aStart..aStart+length)` equals `b[bStart..bStart+length)`. */
export interface Match {
  aStart: number;
  bStart: number;
  length: number;
}

/** Longest-common-subsequence matches between two sequences (Myers' O(ND)
 *  greedy algorithm), as maximal runs in ascending order. */
export function matchSequences<T>(a: readonly T[], b: readonly T[]): Match[] {
  // Trim the common prefix and suffix first: most edits touch a small region.
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }
  const midA = a.slice(prefix, a.length - suffix);
  const midB = b.slice(prefix, b.length - suffix);
  const pairs = myersPairs(midA, midB);

  const matches: Match[] = [];
  const push = (aStart: number, bStart: number, length: number) => {
    if (length <= 0) return;
    const last = matches[matches.length - 1];
    if (last && last.aStart + last.length === aStart && last.bStart + last.length === bStart) {
      last.length += length;
    } else {
      matches.push({ aStart, bStart, length });
    }
  };
  push(0, 0, prefix);
  for (const [i, j] of pairs) push(prefix + i, prefix + j, 1);
  push(a.length - suffix, b.length - suffix, suffix);
  return matches;
}

/** Index pairs (i, j) with a[i] === b[j] forming an LCS, ascending. */
function myersPairs<T>(a: readonly T[], b: readonly T[]): Array<[number, number]> {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return [];
  const max = n + m;
  const offset = max;
  let v: Int32Array<ArrayBuffer> = new Int32Array(2 * max + 2);
  const trace: Int32Array<ArrayBuffer>[] = [];
  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)) x = v[offset + k + 1]!;
      else x = v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
    if (found) trace.push(v.slice());
  }
  // Backtrack through the saved frontiers to recover the diagonal moves.
  const pairs: Array<[number, number]> = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 2; d >= 0 && (x > 0 || y > 0); d--) {
    v = trace[d]!;
    const k = x - y;
    let prevK: number;
    if (k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)) prevK = k + 1;
    else prevK = k - 1;
    const prevX = v[offset + prevK]!;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x--;
      y--;
      pairs.push([x, y]);
    }
    if (d > 0) {
      x = prevX;
      y = prevY;
    }
  }
  return pairs.reverse();
}

/** Minimal-ish edits turning `oldText` into `newText`: a line diff finds the
 *  changed regions, and each region is narrowed to the characters that
 *  actually differ, so collaborators' cursors outside a change stay put. */
export function textEdits(oldText: string, newText: string): TextEdit[] {
  if (oldText === newText) return [];
  const a = splitLines(oldText);
  const b = splitLines(newText);
  const matches = matchSequences(a, b);
  const aOffsets = lineOffsets(a);
  const bOffsets = lineOffsets(b);

  const edits: TextEdit[] = [];
  let ai = 0;
  let bi = 0;
  const flush = (aEnd: number, bEnd: number) => {
    if (ai === aEnd && bi === bEnd) return;
    const from = aOffsets[ai]!;
    const removed = oldText.slice(from, aOffsets[aEnd]!);
    const inserted = newText.slice(bOffsets[bi]!, bOffsets[bEnd]!);
    edits.push(...narrow(from, removed, inserted));
  };
  for (const match of matches) {
    flush(match.aStart, match.bStart);
    ai = match.aStart + match.length;
    bi = match.bStart + match.length;
  }
  flush(a.length, b.length);
  return edits;
}

function lineOffsets(lines: string[]): number[] {
  const offsets = [0];
  for (const line of lines) offsets.push(offsets[offsets.length - 1]! + line.length);
  return offsets;
}

/** Shrink a replaced region to the differing middle. */
function narrow(from: number, removed: string, inserted: string): TextEdit[] {
  let start = 0;
  while (start < removed.length && start < inserted.length && removed[start] === inserted[start]) start++;
  let end = 0;
  while (
    end < removed.length - start &&
    end < inserted.length - start &&
    removed[removed.length - 1 - end] === inserted[inserted.length - 1 - end]
  ) {
    end++;
  }
  const remove = removed.length - start - end;
  const insert = inserted.slice(start, inserted.length - end);
  if (remove === 0 && insert === "") return [];
  return [{ index: from + start, remove, insert }];
}

/** Apply edits (sorted, non-overlapping, indexed against `text`). */
export function applyEdits(text: string, edits: readonly TextEdit[]): string {
  let out = "";
  let cursor = 0;
  for (const edit of edits) {
    out += text.slice(cursor, edit.index) + edit.insert;
    cursor = edit.index + edit.remove;
  }
  return out + text.slice(cursor);
}
