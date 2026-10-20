// Seam 1: files. The core reads every file through this interface, so the same
// build runs from disk (the CLI), from a recorded snapshot (a server job) or, later,
// from an in-memory tree in the browser. Paths are virtual and absolute: "/" is the
// root the host chose (the project holding the deck and its node_modules), which
// keeps the output independent of where the checkout lives.

export type Stat = "file" | "dir" | null;

export interface Files {
  stat(path: string): Stat;
  /** File bytes, or null when the path is not a file. */
  read(path: string): Uint8Array | null;
  /** The path with every symlink resolved (identity for a tree without links). */
  realpath(path: string): string;
  /** Every file in the tree, when the host can list it (memory trees can). */
  paths?(): string[];
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export function readText(files: Files, path: string): string | null {
  const bytes = files.read(path);
  return bytes ? decoder.decode(bytes) : null;
}

export function encodeText(text: string): Uint8Array {
  return encoder.encode(text);
}

/** One recorded answer per path: what `stat`, `read` and `realpath` returned. */
export interface SnapshotEntry {
  /** "f" file, "d" directory; absent means the path did not exist. */
  k?: "f" | "d";
  /** utf-8 text content */
  t?: string;
  /** base64 content (binary files) */
  b?: string;
  /** realpath when it differs from the path */
  r?: string;
}

export interface Snapshot {
  v: 1;
  entries: Record<string, SnapshotEntry>;
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function isUtf8Text(bytes: Uint8Array): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return !bytes.includes(0);
  } catch {
    return false;
  }
}

/** Wrap a Files and record every answer, so a build can be replayed from memory
 *  (the replay asks the same questions in the same way and gets the same answers). */
export function recordingFiles(inner: Files): { files: Files; snapshot(): Snapshot } {
  const entries: Record<string, SnapshotEntry> = {};
  const entry = (p: string) => (entries[p] ??= {});
  const files: Files = {
    stat(path) {
      const s = inner.stat(path);
      const e = entry(path);
      if (s === "file") e.k = "f";
      else if (s === "dir") e.k = "d";
      return s;
    },
    read(path) {
      const bytes = inner.read(path);
      const e = entry(path);
      if (bytes) {
        e.k = "f";
        if (isUtf8Text(bytes)) e.t = new TextDecoder().decode(bytes);
        else e.b = toBase64(bytes);
      }
      return bytes;
    },
    realpath(path) {
      const r = inner.realpath(path);
      if (r !== path) entry(path).r = r;
      return r;
    },
  };
  return {
    files,
    snapshot() {
      const sorted: Record<string, SnapshotEntry> = {};
      for (const k of Object.keys(entries).sort()) sorted[k] = entries[k]!;
      return { v: 1, entries: sorted };
    },
  };
}

/** A Files over a snapshot, optionally with an editable overlay of text files on
 *  top (the editor's tree): overlay paths are plain files, everything else comes
 *  from the snapshot. */
export class MemoryFiles implements Files {
  private bytes = new Map<string, Uint8Array>();
  private dirs = new Set<string>();
  private links = new Map<string, string>();

  constructor(snapshot?: Snapshot) {
    if (!snapshot) return;
    for (const [path, e] of Object.entries(snapshot.entries)) {
      if (e.r) this.links.set(path, e.r);
      if (e.k === "d") this.dirs.add(path);
      if (e.k === "f") {
        if (e.t !== undefined) this.bytes.set(path, encoder.encode(e.t));
        else if (e.b !== undefined) this.bytes.set(path, fromBase64(e.b));
        else this.bytes.set(path, new Uint8Array());
      }
    }
  }

  /** Write a file; its parent directories come into being with it. */
  write(path: string, content: string | Uint8Array): void {
    this.bytes.set(path, typeof content === "string" ? encoder.encode(content) : content);
    for (let d = path.slice(0, path.lastIndexOf("/")); d; d = d.slice(0, d.lastIndexOf("/"))) this.dirs.add(d);
    this.dirs.add("/");
  }

  stat(path: string): Stat {
    if (this.bytes.has(path)) return "file";
    if (this.dirs.has(path)) return "dir";
    return null;
  }

  read(path: string): Uint8Array | null {
    return this.bytes.get(path) ?? null;
  }

  realpath(path: string): string {
    return this.links.get(path) ?? path;
  }

  paths(): string[] {
    return [...this.bytes.keys()].sort();
  }
}

/** Thrown when a gated tree refuses a read; the message names the path. */
export class GateError extends Error {}

export interface GateOptions {
  /** The deck's own files (virtual path). */
  deckRoot: string;
  /** Trusted trees: the framework packages and the host's node_modules. */
  trustedRoots: string[];
  /** Where a deck's third-party packages are unpacked (readable, their CSS checked). */
  packagesRoot?: string;
  /** Says why a stylesheet may not be used, or null; run on deck and package CSS. */
  cssProblem?: (css: string, file: string, scope: string) => string | null;
}

const within = (path: string, root: string) => path === root || path.startsWith(root.endsWith("/") ? root : root + "/");

/** The package folder of a file under `.../node_modules/<name>/`, or null. */
export function packageFolder(path: string): string | null {
  const at = path.lastIndexOf("/node_modules/");
  if (at < 0) return null;
  const rest = path.slice(at + "/node_modules/".length).split("/");
  const depth = rest[0]?.startsWith("@") ? 2 : 1;
  if (rest.length <= depth) return null;
  return path.slice(0, at) + "/node_modules/" + rest.slice(0, depth).join("/");
}

/** A Files that only reads the deck, the trusted trees and the deck's packages,
 *  and checks a deck's (or a package's) stylesheets before anything reads them.
 *  This is the hosted profile's gate: every read the build makes, by the resolver,
 *  esbuild or Tailwind, comes through here. `stat` and `realpath` answer anywhere
 *  (they reveal no content), and a read of a resolved path is checked on its real
 *  path, so a link cannot lead out. */
export function gatedFiles(inner: Files, opts: GateOptions): Files {
  const deckRoot = opts.deckRoot;
  const isPackage = (p: string) => opts.packagesRoot !== undefined && within(p, opts.packagesRoot);
  const isDeck = (p: string) => within(p, deckRoot) && !isPackage(p) && !p.includes("/node_modules/");
  const isTrusted = (p: string) => opts.trustedRoots.some((t) => within(p, t));
  return {
    stat: (p) => inner.stat(p),
    realpath: (p) => inner.realpath(p),
    paths: inner.paths ? () => inner.paths!() : undefined,
    read(path) {
      const p = inner.realpath(path);
      const deck = isDeck(p);
      const pkg = !deck && isPackage(p);
      if (!deck && !pkg && !isTrusted(p)) throw new GateError(`reading ${path} is not allowed in the hosted preview`);
      const bytes = inner.read(p);
      if (bytes && (deck || pkg) && p.endsWith(".css") && opts.cssProblem) {
        const scope = deck ? deckRoot : packageFolder(p);
        const problem = scope ? opts.cssProblem(new TextDecoder().decode(bytes), p, scope) : "is not inside a package folder";
        if (problem) throw new GateError(`${p} ${problem}`);
      }
      return bytes;
    },
  };
}
