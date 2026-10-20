// Host adapter for the Files seam: the real disk under a root directory, exposed
// as virtual paths ("/" is the root). The core never imports this.
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import type { Files, Stat } from "./core/files.ts";

const LOCKFILES = ["bun.lock", "bun.lockb", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"];

const real = (p: string) => {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
};

/** The folder whose tree a deck's build reads: the nearest folder at or above the
 *  deck that holds a lockfile (a workspace root holds the packages' links), else
 *  the deck itself. Everything the build reads must sit under it, so the virtual
 *  paths, and with them the output, do not depend on where the checkout lives. */
export function projectRoot(deckDir: string): string {
  const start = real(deckDir);
  for (let d = start; ; d = dirname(d)) {
    if (LOCKFILES.some((f) => existsSync(join(d, f)))) return workspaceRoot(start, d) ?? d;
    if (dirname(d) === d) return start;
  }
}

const hasLock = (d: string) => LOCKFILES.some((f) => existsSync(join(d, f)));

/** The workspace patterns a package.json declares (`workspaces: [...]` or
 *  `workspaces: { packages: [...] }`), or none. */
function workspacePatterns(dir: string): string[] {
  try {
    const pj = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { workspaces?: string[] | { packages?: string[] } };
    const w = Array.isArray(pj.workspaces) ? pj.workspaces : pj.workspaces?.packages;
    return Array.isArray(w) ? w.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

/** A deck that is a member of a workspace further up installs into that root,
 *  even when it still holds a lockfile of its own (a deck moved into a monorepo):
 *  its node_modules then links into the root's store, so the root is the tree. */
function workspaceRoot(deck: string, nearest: string): string | null {
  for (let d = dirname(nearest); dirname(d) !== d; d = dirname(d)) {
    if (!hasLock(d)) continue;
    const rel = deck.slice(d.length + 1).split(sep).join("/");
    for (const pattern of workspacePatterns(d)) {
      const re = new RegExp(`^${pattern.replace(/^\.\//, "").replace(/\/+$/, "").replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*")}$`);
      if (re.test(rel)) return d;
    }
  }
  return null;
}

export class DiskFiles implements Files {
  readonly root: string;

  constructor(root: string) {
    this.root = real(root);
  }

  /** The real path of a virtual one. */
  real(path: string): string {
    return path === "/" ? this.root : this.root + path.split("/").join(sep);
  }

  /** The virtual path of a real one under the root, or null when it is outside. */
  virtual(abs: string): string | null {
    const r = real(abs);
    if (r === this.root) return "/";
    if (!r.startsWith(this.root + sep)) return null;
    return r.slice(this.root.length).split(sep).join("/");
  }

  stat(path: string): Stat {
    try {
      const s = statSync(this.real(path));
      return s.isFile() ? "file" : s.isDirectory() ? "dir" : null;
    } catch {
      return null;
    }
  }

  read(path: string): Uint8Array | null {
    try {
      return new Uint8Array(readFileSync(this.real(path)));
    } catch {
      return null;
    }
  }

  realpath(path: string): string {
    let r: string;
    try {
      r = realpathSync(this.real(path));
    } catch {
      return path;
    }
    if (r !== this.root && !r.startsWith(this.root + sep)) {
      throw new Error(`${path} is a link to ${r}, outside ${this.root}; the build reads only the project's own tree`);
    }
    return r.slice(this.root.length).split(sep).join("/") || "/";
  }

  /** Every file under a virtual folder (no node_modules, no dot folders). */
  list(dir: string): string[] {
    const out: string[] = [];
    const walk = (v: string) => {
      let names: string[];
      try {
        names = readdirSync(this.real(v));
      } catch {
        return;
      }
      for (const name of names.sort()) {
        if (name === "node_modules" || name.startsWith(".")) continue;
        const p = v === "/" ? `/${name}` : `${v}/${name}`;
        const s = this.stat(p);
        if (s === "dir") walk(p);
        else if (s === "file") out.push(p);
      }
    };
    walk(dir);
    return out;
  }
}
