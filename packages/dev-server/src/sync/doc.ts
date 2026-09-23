// The live document of a deck: its source files as Y.Text under `files`, and
// the server's checkpoint records under `checkpoints`. Browser-safe.

import * as Y from "yjs";
import { textEdits } from "./diff.ts";
import type { FileTree } from "./merge.ts";
import { MAX_FILES, MAX_SOURCE_BYTES, MAX_TOTAL_BYTES, isSyncPath } from "./sources.ts";

export interface Author {
  name: string;
  email: string;
}

/** Appended by the server for every checkpoint it commits. */
export interface CheckpointRecord {
  commit: string;
  parent: string | null;
  time: number;
  /** First is the commit author, the rest are credited as co-authors. */
  authors: Author[];
  message: string;
  kind: "auto" | "save" | "import";
}

export function filesMap(doc: Y.Doc): Y.Map<Y.Text> {
  return doc.getMap<Y.Text>("files");
}

export function checkpointList(doc: Y.Doc): Y.Array<CheckpointRecord> {
  return doc.getArray<CheckpointRecord>("checkpoints");
}

export function lastCheckpoint(doc: Y.Doc): CheckpointRecord | null {
  const list = checkpointList(doc);
  return list.length > 0 ? list.get(list.length - 1) : null;
}

/** The current source tree. Entries that are not text are skipped. */
export function readTree(doc: Y.Doc): FileTree {
  const tree: FileTree = {};
  for (const [path, text] of filesMap(doc).entries()) if (text instanceof Y.Text) tree[path] = text.toString();
  return tree;
}

/** Why a live document is not an acceptable deck, or null. Checks what a
 *  participant could put there: unknown top-level types, file entries that
 *  are not text or not safe source paths, and sizes over the caps (counted in
 *  UTF-16 units, which bounds the bytes closely enough and stays cheap). */
export function docProblem(doc: Y.Doc): string | null {
  for (const name of doc.share.keys()) {
    if (name !== "files" && name !== "checkpoints") return `unexpected shared type: ${name}`;
  }
  const files = filesMap(doc);
  if (files.size > MAX_FILES) return "too many files";
  let total = 0;
  for (const [path, text] of files.entries()) {
    if (!isSyncPath(path)) return `not a source path: ${path}`;
    if (!(text instanceof Y.Text)) return `not text: ${path}`;
    if (text.length > MAX_SOURCE_BYTES) return `file too large: ${path}`;
    total += text.length;
  }
  if (total > MAX_TOTAL_BYTES) return "deck sources too large";
  return null;
}

/** Replace one file's content by minimal edits (creating the file if needed). */
export function setFile(doc: Y.Doc, path: string, content: string, origin?: unknown): void {
  doc.transact(() => {
    const files = filesMap(doc);
    const existing = files.get(path);
    if (!existing) {
      const text = new Y.Text();
      text.insert(0, content);
      files.set(path, text);
      return;
    }
    applyTextEdits(existing, content);
  }, origin);
}

export function deleteFile(doc: Y.Doc, path: string, origin?: unknown): void {
  doc.transact(() => filesMap(doc).delete(path), origin);
}

/** Make the document's files equal `tree`, touching only what differs. */
export function applyTree(doc: Y.Doc, tree: FileTree, origin?: unknown): void {
  doc.transact(() => {
    const files = filesMap(doc);
    for (const path of [...files.keys()]) if (!(path in tree)) files.delete(path);
    for (const [path, content] of Object.entries(tree)) setFile(doc, path, content, origin);
  }, origin);
}

/** Apply the edits turning the text's content into `next`, back to front so
 *  earlier indices stay valid. */
export function applyTextEdits(text: Y.Text, next: string): void {
  const edits = textEdits(text.toString(), next);
  for (let i = edits.length - 1; i >= 0; i--) {
    const edit = edits[i]!;
    if (edit.remove > 0) text.delete(edit.index, edit.remove);
    if (edit.insert) text.insert(edit.index, edit.insert);
  }
}
