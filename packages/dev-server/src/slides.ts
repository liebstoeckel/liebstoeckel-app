import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { findEntryFile } from "@liebstoeckel/cli/migrations";

// Entry resolution lives with the scaffold-migration registry (its detectors
// need it too); re-exported here for existing importers.
export { findEntryFile };

// Slide → source-file attribution. The deck entry is the structured IR (it
// imports slide components and passes an ordered `slides={[...]}` array), so a
// static parse of the entry recovers the mapping without running anything.
// Best-effort by design: an unresolvable identifier yields null for that slot
// and the agent falls back to reading the entry itself (it gets the deck dir
// and slide index either way).

/** Map of imported identifier → import specifier, covering default, named,
 *  and namespace imports (`import * as slide from "./slides/02"` is the
 *  documented way to carry a slide's `notes`, so it must resolve). */
export function parseImports(source: string): Map<string, string> {
  const map = new Map<string, string>();
  const importRe = /import\s+([^'"]+?)\s+from\s+["']([^"']+)["']/g;
  for (const match of source.matchAll(importRe)) {
    const clause = match[1]!.trim();
    const spec = match[2]!;
    const namespace = clause.match(/^\*\s+as\s+([A-Za-z_$][\w$]*)$/);
    if (namespace) {
      map.set(namespace[1]!, spec);
      continue;
    }
    // Default import (possibly followed by named): `X` or `X, { ... }`
    const defaultMatch = clause.match(/^([A-Za-z_$][\w$]*)\s*(?:,|$)/);
    if (defaultMatch) map.set(defaultMatch[1]!, spec);
    // Named imports: { A, B as C }
    const named = clause.match(/\{([^}]*)\}/);
    if (named) {
      for (const part of named[1]!.split(",")) {
        const [, alias] = part.trim().match(/^(?:[\w$]+\s+as\s+)?([A-Za-z_$][\w$]*)$/) ?? [];
        if (alias) map.set(alias, spec);
      }
    }
  }
  return map;
}

/** The ordered identifier list inside `slides={[ ... ]}` (JSX) or
 *  `slides: [ ... ]` (object form). Non-identifier items (inline elements,
 *  calls, spreads) become null holes. */
export function parseSlideIdentifiers(source: string): string[] | null {
  const anchor = source.match(/slides\s*(?:=\s*\{|\:)\s*\[/);
  if (!anchor || anchor.index === undefined) return null;
  const start = anchor.index + anchor[0].length;
  // Scan to the matching close bracket, tolerating nested brackets.
  let depth = 1;
  let end = -1;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;
  return source
    .slice(start, end)
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => (/^[A-Za-z_$][\w$]*$/.test(item) ? item : ""));
}

const SLIDE_EXTENSIONS = ["", ".mdx", ".tsx", ".ts", ".jsx", ".js", ".md"];

/** Resolve a relative import specifier against the entry's directory to an
 *  existing deck-relative file, trying the usual authoring extensions. */
function resolveSpecifier(deckDir: string, entryRel: string, spec: string): string | null {
  if (!spec.startsWith("./") && !spec.startsWith("../")) return null;
  const base = join(dirname(entryRel), spec);
  for (const ext of SLIDE_EXTENSIONS) {
    const candidate = normalize(base + ext);
    if (candidate.startsWith("..")) return null;
    if (existsSync(join(deckDir, candidate))) return candidate.split("\\").join("/");
  }
  return null;
}

/** Ordered slide source files for the deck, null holes where attribution
 *  failed, or null when the entry or slides array could not be found at all. */
export function resolveSlideFiles(deckDir: string): Array<string | null> | null {
  const entry = findEntryFile(deckDir);
  if (!entry) return null;
  const source = readFileSync(join(deckDir, entry), "utf-8");
  const identifiers = parseSlideIdentifiers(source);
  if (!identifiers) return null;
  const imports = parseImports(source);
  return identifiers.map((ident) => {
    if (!ident) return null;
    const spec = imports.get(ident);
    if (!spec) return null;
    return resolveSpecifier(deckDir, entry, spec);
  });
}
