import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

export type Surface = "entry" | "index.html" | "tooling";

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
    /** Returns what it changed (the deck-relative path of the patched file, or
     *  a short list), for the notice. */
    apply(deckDir: string): string;
  };
  /** The exact next steps for the parts that need a person, one line each
   *  (shown with the hint). */
  details?(deckDir: string): string[];
}

export interface MigrationStatus {
  id: string;
  needed: boolean;
  since: string;
  reference: string;
  reason: string;
  /** True when `liebstoeckel dev` would fix this automatically right now. */
  autoPatchable: boolean;
  /** The steps that need a person, when the migration knows them. */
  details?: string[];
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
// reloads instead of jumping back to slide 1. A built deck has no hot reload:
// the build gives it an inert import.meta.hot, so this runs once, as written.`;

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


// ---------------------------------------------------------------------------
// 0003: the scaffold's Bun tooling files. Decks scaffolded before the build core
// carry a bunfig.toml (Bun bundler plugins for Bun's dev server), a server.ts
// (Bun's dev server) and a build.ts, and their package.json scripts run those.
// `liebstoeckel dev` and `liebstoeckel build` do all of it now. Files still
// byte-for-byte as some release scaffolded them (line endings and trailing
// space aside) are removed, with the scripts that ran them; anything changed
// stays, and the hint says what to do with it.

/** Every version of the three files a release of `liebstoeckel new` wrote. */
export const SCAFFOLD_TOOLING: Record<"bunfig.toml" | "server.ts" | "build.ts", string[]> = {
  "bunfig.toml": [
    "# Plugins for the HMR dev server (Bun.serve HTML routes). The build path uses\n# Bun.build()'s plugins array in build.ts instead.\n[serve.static]\nplugins = [\"bun-plugin-tailwind\", \"../../packages/engine/src/build/mdx-plugin.ts\", \"../../packages/engine/src/build/visx-esm-plugin.ts\"]\n",
    "# Plugins for the HMR dev server (Bun.serve HTML routes). The build path uses\n# Bun.build()'s plugins array in build.ts instead.\n[serve.static]\nplugins = [\"bun-plugin-tailwind\", \"@liebstoeckel/engine/mdx-plugin\", \"@liebstoeckel/engine/visx-esm-plugin\"]\n",
    "# Plugins for the HMR dev server (Bun.serve HTML routes). The build path uses\n# Bun.build()'s plugins array in build.ts instead.\n[serve.static]\nplugins = [\"bun-plugin-tailwind\", \"../../packages/engine/src/build/mdx-plugin.ts\"]\n",
  ],
  "server.ts": [
    "import index from \"./index.html\";\n\n// Dev server with frontend HMR + React Fast Refresh.\nconst server = Bun.serve({\n  routes: { \"/\": index },\n  development: { hmr: true, console: true },\n  hostname: \"0.0.0.0\",\n  port: 3000,\n});\n\nconsole.log(`\u25b6  http://localhost:${server.port}`);\n",
    "import index from \"./index.html\";\n\n// Dev server with frontend HMR + React Fast Refresh.\nconst server = Bun.serve({\n  routes: { \"/\": index },\n  development: { hmr: true, console: true },\n  hostname: \"0.0.0.0\",\n  port: Number(process.env.PORT) || 3000,\n});\n\nconsole.log(`\u25b6  http://localhost:${server.port}`);\n",
  ],
  "build.ts": [
    "import { buildDeck } from \"@liebstoeckel/thumbnails/build\";\n\n// Single self-contained .html + slide thumbnails (skip with LIEBSTOECKEL_NO_THUMBS=1).\nawait buildDeck({ entry: \"./index.html\", outdir: \"./dist\" });\n",
    "import { buildDeckWithThumbnails } from \"@liebstoeckel/thumbnails/build\";\n\n// Single self-contained .html + slide thumbnails (skip with LIEBSTOECKEL_NO_THUMBS=1).\nawait buildDeckWithThumbnails({ entry: \"./index.html\", outdir: \"./dist\" });\n",
    "import { buildDeckWithThumbnails } from \"@present-it/thumbnails/build\";\n\n// Single self-contained .html + slide thumbnails (skip with PRESENT_IT_NO_THUMBS=1).\nawait buildDeckWithThumbnails({ entry: \"./index.html\", outdir: \"./dist\" });\n",
  ],
};

const OLD_SCRIPTS: Record<string, { file: keyof typeof SCAFFOLD_TOOLING; was: string; now: string }> = {
  dev: { file: "server.ts", was: "bun --hot ./server.ts", now: "liebstoeckel dev" },
  build: { file: "build.ts", was: "bun run build.ts", now: "liebstoeckel build" },
};

const normalizeText = (s: string) => s.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").replace(/\s*$/, "\n");

/** Each tooling file the deck has: "scaffold" when it is a released template, "changed" otherwise. */
function toolingState(deckDir: string): Array<{ file: keyof typeof SCAFFOLD_TOOLING; state: "scaffold" | "changed" }> {
  const out: Array<{ file: keyof typeof SCAFFOLD_TOOLING; state: "scaffold" | "changed" }> = [];
  for (const file of Object.keys(SCAFFOLD_TOOLING) as Array<keyof typeof SCAFFOLD_TOOLING>) {
    const p = join(deckDir, file);
    if (!existsSync(p)) continue;
    const text = normalizeText(readFileSync(p, "utf-8"));
    out.push({ file, state: SCAFFOLD_TOOLING[file].some((t) => normalizeText(t) === text) ? "scaffold" : "changed" });
  }
  return out;
}

function readPkg(deckDir: string): { raw: string; pkg: Record<string, unknown> } | null {
  const p = join(deckDir, "package.json");
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, "utf-8");
  try {
    return { raw, pkg: JSON.parse(raw) as Record<string, unknown> };
  } catch {
    return null;
  }
}

/** The package.json scripts that still run a tooling file. */
function oldScripts(deckDir: string): string[] {
  const scripts = readPkg(deckDir)?.pkg.scripts as Record<string, unknown> | undefined;
  return Object.entries(OLD_SCRIPTS)
    .filter(([name, s]) => scripts?.[name] === s.was)
    .map(([name]) => name);
}

const scaffoldTooling: Migration = {
  id: "0003-scaffold-tooling-files",
  since: "0.4.0",
  surfaces: ["tooling"],
  reference: "references/migrations/0003-scaffold-tooling-files.md",
  reason: "liebstoeckel dev and liebstoeckel build now do what the scaffold's bunfig.toml, server.ts and build.ts did (Bun's dev server and Bun.build), so those files and the scripts that ran them are no longer needed",
  detect(deckDir) {
    return toolingState(deckDir).length > 0 || oldScripts(deckDir).length > 0;
  },
  autoPatch: {
    canApply(deckDir) {
      return toolingState(deckDir).some((t) => t.state === "scaffold");
    },
    apply(deckDir) {
      const removed = toolingState(deckDir)
        .filter((t) => t.state === "scaffold")
        .map((t) => t.file);
      for (const file of removed) rmSync(join(deckDir, file), { force: true });
      const done: string[] = removed.map((f) => `removed ${f}`);
      const read = readPkg(deckDir);
      if (read) {
        const { raw, pkg } = read;
        const scripts = (pkg.scripts ?? {}) as Record<string, unknown>;
        let changed = false;
        for (const [name, s] of Object.entries(OLD_SCRIPTS)) {
          // Only a script whose file is gone now: a kept, changed server.ts still runs.
          if (scripts[name] === s.was && !existsSync(join(deckDir, s.file))) {
            scripts[name] = s.now;
            done.push(`scripts.${name} = "${s.now}"`);
            changed = true;
          }
        }
        if (Array.isArray(pkg.files)) {
          const kept = (pkg.files as unknown[]).filter((f) => !(typeof f === "string" && (removed as string[]).includes(f)));
          if (kept.length !== pkg.files.length) {
            pkg.files = kept;
            done.push("dropped them from files");
            changed = true;
          }
        }
        if (changed) {
          const indent = /^[ \t]+/m.exec(raw.split("\n")[1] ?? "")?.[0] ?? "  ";
          const eol = raw.includes("\r\n") ? "\r\n" : "\n";
          writeFileSync(join(deckDir, "package.json"), JSON.stringify(pkg, null, indent).replace(/\n/g, eol) + eol, "utf-8");
        }
      }
      return done.join(", ");
    },
  },
  details(deckDir) {
    const lines: string[] = [];
    for (const t of toolingState(deckDir)) {
      if (t.state !== "changed") continue;
      if (t.file === "server.ts") {
        lines.push("server.ts differs from the scaffold: `liebstoeckel dev` replaces it (hot reload, dev mode); move what you added elsewhere, then delete it and set scripts.dev to \"liebstoeckel dev\"");
      } else if (t.file === "build.ts") {
        lines.push("build.ts differs from the scaffold: `liebstoeckel build` replaces it; move what you added elsewhere, then delete it and set scripts.build to \"liebstoeckel build\"");
      } else {
        lines.push("bunfig.toml differs from the scaffold: its [serve.static] plugins are no longer used, remove that section (keep anything else you set there)");
      }
    }
    for (const name of oldScripts(deckDir)) {
      const s = OLD_SCRIPTS[name]!;
      if (existsSync(join(deckDir, s.file))) continue;
      lines.push(`package.json scripts.${name} still runs ${s.file}, which is gone: set it to "${s.now}"`);
    }
    return lines;
  },
};

/** Ordered registry. Append only; ids are stable forever. */
export const MIGRATIONS: Migration[] = [hmrEntryBoundary, devLoaderTag, scaffoldTooling];

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
    const details = needed ? (m.details?.(deckDir) ?? []) : [];
    return {
      id: m.id,
      needed,
      since: m.since,
      reference: m.reference,
      reason: m.reason,
      autoPatchable: needed && !!m.autoPatch && m.autoPatch.canApply(deckDir),
      ...(details.length ? { details } : {}),
    };
  });
  return { migrations, warnings };
}

export interface AutoPatchResult {
  applied: Array<{ id: string; file: string; reason: string }>;
  hinted: Array<{ id: string; reference: string; reason: string; details?: string[] }>;
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
      // What an application had to leave (a changed file) still needs a person.
      if (!m.detect(deckDir)) continue;
    }
    const details = m.details?.(deckDir) ?? [];
    result.hinted.push({ id: m.id, reference: m.reference, reason: m.reason, ...(details.length ? { details } : {}) });
  }
  return result;
}
