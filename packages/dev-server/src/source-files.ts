// Which files of a deck folder are synced as live sources, read from disk: the
// shared source rules (sync/sources.ts), minus files the developer's Git ignores
// and files on the credential denylist (sync/secrets.ts). Used wherever sources
// are collected: `push --source`, `pull`, the `dev --live` mirror.
//
// `.gitignore` files count from the root of the Git repository the deck sits in
// (the nearest folder above with a `.git`) down to the deck folder, and every one
// inside it, the way Git reads them: a deeper file overrides a shallower one, a
// `!pattern` takes a path back in, and nothing below an ignored folder comes back.
// Without a repository around it, only the deck folder's own files count. Global
// excludes (`core.excludesFile`, `.git/info/exclude`) are not read.

import { type Dirent, existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import ignore, { type Ignore } from "ignore";
import { SKIP_DIRS, isSyncPath } from "./sync/sources.ts";
import { isDeniedPath } from "./sync/secrets.ts";

export type SkipReason = "gitignore" | "denylist";

export interface SourceListing {
  /** Deck-relative source paths to sync, sorted. */
  paths: string[];
  /** Source files left out, and why (sorted by path). */
  skipped: Array<{ path: string; reason: SkipReason }>;
}

interface RuleSet {
  /** Absolute folder the .gitignore sits in. */
  base: string;
  ig: Ignore;
}

function readRules(dir: string): RuleSet | null {
  const file = join(dir, ".gitignore");
  if (!existsSync(file)) return null;
  try {
    return { base: dir, ig: ignore().add(readFileSync(file, "utf8")) };
  } catch {
    return null;
  }
}

/** The .gitignore rule sets above the deck folder, shallowest first, from the
 *  repository root (empty when the folder is not inside a repository). */
function ancestorRules(deckDir: string): RuleSet[] {
  const chain: string[] = [];
  let at = dirname(deckDir);
  let repoRoot: string | null = existsSync(join(deckDir, ".git")) ? deckDir : null;
  while (!repoRoot) {
    chain.push(at);
    if (existsSync(join(at, ".git"))) {
      repoRoot = at;
      break;
    }
    const up = dirname(at);
    if (up === at) return [];
    at = up;
  }
  if (repoRoot === deckDir) return [];
  return chain
    .reverse()
    .map(readRules)
    .filter((r): r is RuleSet => r !== null);
}

/** Git's answer for one path under a stack of rule sets (shallowest first). */
function ignored(rules: RuleSet[], abs: string, isDir: boolean): boolean {
  let out = false;
  for (const r of rules) {
    const rel = relative(r.base, abs).split(sep).join("/");
    if (!rel || rel.startsWith("..")) continue;
    const verdict = r.ig.test(isDir ? `${rel}/` : rel);
    if (verdict.ignored) out = true;
    else if (verdict.unignored) out = false;
  }
  return out;
}

/** Walk a deck folder and sort its source files into synced and skipped. */
export function listDeckSources(deckDir: string): SourceListing {
  const root = resolve(deckDir);
  const paths: string[] = [];
  const skipped: SourceListing["skipped"] = [];
  const walk = (abs: string, rel: string, rules: RuleSet[]) => {
    let entries: Dirent[];
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    const own = readRules(abs);
    const here = own ? [...rules, own] : rules;
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      const childAbs = join(abs, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        if (ignored(here, childAbs, true)) continue;
        walk(childAbs, childRel, here);
      } else if (e.isFile() && isSyncPath(childRel)) {
        if (isDeniedPath(childRel)) skipped.push({ path: childRel, reason: "denylist" });
        else if (ignored(here, childAbs, false)) skipped.push({ path: childRel, reason: "gitignore" });
        else paths.push(childRel);
      }
    }
  };
  walk(root, "", ancestorRules(root));
  paths.sort();
  skipped.sort((a, b) => (a.path < b.path ? -1 : 1));
  return { paths, skipped };
}

/** A one-line summary of skipped files for people ("2 files not synced: ..."). */
export function describeSkipped(skipped: SourceListing["skipped"], max = 5): string | null {
  if (skipped.length === 0) return null;
  const names = skipped.slice(0, max).map((s) => `${s.path} (${s.reason === "gitignore" ? ".gitignore" : "looks like a credentials file"})`);
  const more = skipped.length > max ? `, and ${skipped.length - max} more` : "";
  return `${skipped.length} source file${skipped.length === 1 ? "" : "s"} not synced: ${names.join(", ")}${more}`;
}

/** Why one deck-relative path would not be synced from this folder (whether or
 *  not the file exists): on the denylist, or ignored by Git. Null when it would. */
export function exclusionOf(deckDir: string, rel: string): SkipReason | null {
  if (isDeniedPath(rel)) return "denylist";
  const root = resolve(deckDir);
  const rules = ancestorRules(root);
  const segments = rel.split("/");
  let dir = root;
  for (let i = 0; i < segments.length; i++) {
    const own = readRules(dir);
    if (own) rules.push(own);
    const abs = join(dir, segments[i]!);
    const last = i === segments.length - 1;
    if (ignored(rules, abs, !last)) return "gitignore";
    dir = abs;
  }
  return null;
}
