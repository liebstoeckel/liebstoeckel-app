import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { addDevLoaderTag, hasDevLoaderTag } from "./dev-loader";

// The scaffold-migration registry. Conventions in scaffolded, user-owned deck
// source keep improving pre-1.0; this registry is the one mechanism that
// detects an out-of-date convention (`doctor`), applies it automatically where
// the file still matches the scaffolded shape (`dev` boot), and routes humans
// and agents to the per-migration guide shipped inside the skill.
//
// Contract invariants:
// - `autoPatch.apply` may only run after `canApply` recognized the scaffolded
//   shape; never rewrite source that diverged from what we scaffolded.
// - Every `apply` writes output that explains itself in the file (a comment or
//   self-describing tag): the git diff, not the terminal, is what a confused
//   reader has.
// - Decks opt out of a migration deliberately via `liebstoeckel.migrationOptOut`
//   in their package.json (id to reason map, reason mandatory); a suppressed id
//   is never detected, hinted, or patched.
//
// Keep this module an import leaf (node builtins + ./dev-loader only): the
// dev-server package imports it while the CLI umbrella soft-imports the dev
// server, so importing any CLI command module from here is a load cycle.

export type Surface = "entry" | "index.html";

export interface Migration {
  /** "NNNN-slug", stable forever; the opt-out key and the guide's frontmatter id. */
  id: string;
  /** CLI version that introduced the convention. */
  since: string;
  surfaces: Surface[];
  /** Skill-relative path of the guide for this migration. */
  reference: string;
  /** One sentence: why this change exists. Shown in every hint and notice. */
  reason: string;
  /** Cheap, read-only file inspection: does this deck still need the migration? */
  detect(deckDir: string): boolean;
  /** Present only when unattended application is safe for a recognized shape. */
  autoPatch?: {
    canApply(deckDir: string): boolean;
    /** Returns the deck-relative path of the patched file (for the notice). */
    apply(deckDir: string): string;
  };
}

export interface MigrationStatus {
  id: string;
  needed: boolean;
  since: string;
  reference: string;
  reason: string;
  /** True when `liebstoeckel dev` would fix this automatically right now. */
  autoPatchable: boolean;
  suppressed?: boolean;
  suppressReason?: string;
}

/** The deck's entry script, from index.html's module script tag. */
export function findEntryFile(deckDir: string, indexHtml = "index.html"): string | null {
  const htmlPath = join(deckDir, indexHtml);
  if (!existsSync(htmlPath)) return null;
  const html = readFileSync(htmlPath, "utf-8");
  // Local specifiers only: `./main.tsx`, `main.tsx`, `/main.tsx`. A URL
  // (`http://`, `//cdn`) is never a deck file.
  const match = html.match(/<script[^>]*type=["']module["'][^>]*src=["']([^"']+)["']/i)
    ?? html.match(/<script[^>]*src=["']([^"']+)["'][^>]*type=["']module["']/i);
  if (!match) return null;
  const src = match[1]!;
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("//")) return null;
  const rel = normalize(src.replace(/^(\.\/|\/)/, ""));
  if (!rel || rel === "." || rel.startsWith("..")) return null;
  return existsSync(join(deckDir, rel)) ? rel.split("\\").join("/") : null;
}

// ---------------------------------------------------------------------------
// 0001: the HMR-preserving entry boundary. Without it, every dev-mode slide
// edit tears down the page and resets the deck to slide 1.

/** The chained scaffold shape: `createRoot(document.getElementById("root")!).render(`.
 *  Whitespace-tolerant; anchored to a line start so a diverged one-liner
 *  (`const app = createRoot(...)...`) is not recognized. */
const ENTRY_CHAIN_RE = /(^[ \t]*)createRoot\s*\(\s*document\.getElementById\(\s*["']root["']\s*\)\s*!?\s*\)\s*\.render\s*\(/m;

/** Same comment the scaffold ships, so migrated and fresh decks read alike. */
const HMR_COMMENT = `// Hot-module boundary: a slide edit re-runs this entry into the SAME React root,
// so the deck keeps its state (current slide, step) across dev-server hot
// reloads instead of jumping back to slide 1. \`bun build\` compiles the
// hot.data access to a plain createRoot and erases accept() in built decks.`;

/** `import.meta.hot.accept()` and the optional-chained forms
 *  (`import.meta.hot?.accept()`, `import.meta.hot?.accept?.()`) all make the
 *  entry a self-accepting boundary; any of them counts as migrated. */
const HOT_ACCEPT_RE = /import\.meta\.hot\??\.accept(?:\?\.)?\s*\(/;

function readEntry(deckDir: string): { rel: string; source: string } | null {
  const rel = findEntryFile(deckDir);
  if (!rel) return null;
  return { rel, source: readFileSync(join(deckDir, rel), "utf-8") };
}

const hmrEntryBoundary: Migration = {
  id: "0001-hmr-entry-boundary",
  since: "0.3.11",
  surfaces: ["entry"],
  reference: "references/migrations/0001-hmr-entry-boundary.md",
  reason: "slide edits in dev mode reset the deck to slide 1 unless the entry is an import.meta.hot boundary with a persisted root",
  detect(deckDir) {
    const entry = readEntry(deckDir);
    return entry !== null && !HOT_ACCEPT_RE.test(entry.source);
  },
  autoPatch: {
    canApply(deckDir) {
      const entry = readEntry(deckDir);
      if (!entry || entry.source.includes("import.meta.hot")) return false;
      const matches = entry.source.match(new RegExp(ENTRY_CHAIN_RE.source, "gm"));
      return matches !== null && matches.length === 1;
    },
    apply(deckDir) {
      const entry = readEntry(deckDir);
      if (!entry) throw new Error("entry file disappeared between canApply and apply");
      // Match the file's own line endings so a CRLF deck does not end up mixed.
      const eol = entry.source.includes("\r\n") ? "\r\n" : "\n";
      // The non-null `!` is TypeScript syntax; a .js/.jsx/.mjs entry would
      // stop parsing with it, so only a TypeScript entry gets it.
      const bang = /\.tsx?$/.test(entry.rel) ? "!" : "";
      const patched = entry.source.replace(
        ENTRY_CHAIN_RE,
        (_m, indent: string) =>
          `${indent}${HMR_COMMENT.split("\n").join(`${eol}${indent}`)}${eol}` +
          `${indent}const root = (import.meta.hot.data.root ??= createRoot(document.getElementById("root")${bang}));${eol}` +
          `${indent}root.render(`,
      );
      const withAccept = `${patched.replace(/\s*$/, eol)}import.meta.hot.accept();${eol}`;
      writeFileSync(join(deckDir, entry.rel), withAccept, "utf-8");
      return entry.rel;
    },
  },
};

// ---------------------------------------------------------------------------
// 0002: the dev-mode loader tag in index.html. Permanent deck source (inert
// outside `dev`, stripped from builds); decks scaffolded before dev mode
// existed lack it. Absorbs what `dev` boot used to do ad hoc.

const devLoaderTag: Migration = {
  id: "0002-dev-loader-tag",
  since: "0.3.11",
  surfaces: ["index.html"],
  reference: "references/migrations/0002-dev-loader-tag.md",
  reason: "the dev-mode bridge (the shell's sidebar talks to the framed deck through it) only loads when index.html carries the dev-mode loader tag (inert outside dev, stripped from builds)",
  detect(deckDir) {
    const htmlPath = join(deckDir, "index.html");
    return existsSync(htmlPath) && !hasDevLoaderTag(readFileSync(htmlPath, "utf-8"));
  },
  autoPatch: {
    canApply(deckDir) {
      // Recognized shape: an anchor to insert at. HTML with neither a </head>
      // nor a <body is not something we prepend to unattended; hint instead.
      const htmlPath = join(deckDir, "index.html");
      if (!existsSync(htmlPath)) return false;
      const html = readFileSync(htmlPath, "utf-8");
      return html.includes("</head>") || html.includes("<body");
    },
    apply(deckDir) {
      const htmlPath = join(deckDir, "index.html");
      writeFileSync(htmlPath, addDevLoaderTag(readFileSync(htmlPath, "utf-8")), "utf-8");
      return "index.html";
    },
  },
};

/** Ordered registry. Append only; ids are stable forever. */
export const MIGRATIONS: Migration[] = [hmrEntryBoundary, devLoaderTag];

// ---------------------------------------------------------------------------
// Opt-out: `liebstoeckel.migrationOptOut` in the deck's package.json.

/** Suppressions (id to reason, reason mandatory) plus warnings for entries
 *  that suppress nothing: empty reasons and ids matching no registry entry. */
export function readMigrationOptOut(deckDir: string): { optOut: Map<string, string>; warnings: string[] } {
  const optOut = new Map<string, string>();
  const warnings: string[] = [];
  const pkgPath = join(deckDir, "package.json");
  if (!existsSync(pkgPath)) return { optOut, warnings };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch {
    return { optOut, warnings };
  }
  const map = (raw as { liebstoeckel?: { migrationOptOut?: unknown } })?.liebstoeckel?.migrationOptOut;
  if (!map || typeof map !== "object" || Array.isArray(map)) return { optOut, warnings };
  for (const [id, reason] of Object.entries(map as Record<string, unknown>)) {
    if (!MIGRATIONS.some((m) => m.id === id)) {
      warnings.push(`migrationOptOut lists unknown migration id "${id}" (known: ${MIGRATIONS.map((m) => m.id).join(", ")})`);
      continue;
    }
    if (typeof reason !== "string" || reason.trim() === "") {
      warnings.push(`migrationOptOut["${id}"] has no reason; a reason is mandatory, so the migration is NOT suppressed`);
      continue;
    }
    optOut.set(id, reason.trim());
  }
  return { optOut, warnings };
}

// ---------------------------------------------------------------------------
// Hosts.

const forSurfaces = (surfaces?: Surface[]): Migration[] =>
  surfaces ? MIGRATIONS.filter((m) => m.surfaces.some((s) => surfaces.includes(s))) : MIGRATIONS;

/** Status of every registry entry for this deck (read-only; the `doctor`
 *  surface). Suppressed ids skip `detect` entirely and report why. */
export function neededMigrations(
  deckDir: string,
  surfaces?: Surface[],
): { migrations: MigrationStatus[]; warnings: string[] } {
  const { optOut, warnings } = readMigrationOptOut(deckDir);
  const migrations = forSurfaces(surfaces).map((m): MigrationStatus => {
    const suppressReason = optOut.get(m.id);
    if (suppressReason !== undefined) {
      return { id: m.id, needed: false, since: m.since, reference: m.reference, reason: m.reason, autoPatchable: false, suppressed: true, suppressReason };
    }
    const needed = m.detect(deckDir);
    return {
      id: m.id,
      needed,
      since: m.since,
      reference: m.reference,
      reason: m.reason,
      autoPatchable: needed && !!m.autoPatch && m.autoPatch.canApply(deckDir),
    };
  });
  return { migrations, warnings };
}

export interface AutoPatchResult {
  applied: Array<{ id: string; file: string; reason: string }>;
  hinted: Array<{ id: string; reference: string; reason: string }>;
  warnings: string[];
}

/** The `dev` boot host: for each needed migration on the given surfaces, apply
 *  it when the file still matches the scaffolded shape, else hand back a hint.
 *  Suppressed ids are skipped silently (their opt-out warnings still surface). */
export function runAutoPatches(deckDir: string, surfaces: Surface[]): AutoPatchResult {
  const { optOut, warnings } = readMigrationOptOut(deckDir);
  const result: AutoPatchResult = { applied: [], hinted: [], warnings };
  for (const m of forSurfaces(surfaces)) {
    if (optOut.has(m.id)) continue;
    if (!m.detect(deckDir)) continue;
    if (m.autoPatch?.canApply(deckDir)) {
      result.applied.push({ id: m.id, file: m.autoPatch.apply(deckDir), reason: m.reason });
    } else {
      result.hinted.push({ id: m.id, reference: m.reference, reason: m.reason });
    }
  }
  return result;
}
