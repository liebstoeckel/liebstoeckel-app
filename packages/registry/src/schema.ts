/**
 * The registry item contract — (internal ADR) (ownership) / (internal ADR) (protocol).
 *
 * This is the single published schema that BOTH the registry data and the CLI
 * resolver validate against, so a malformed or unsafe item is rejected before any
 * file is written into a deck. Pure and network-free → unit-testable.
 */

export type RegistryItemType =
  | "registry:chart"
  | "registry:hook"
  | "registry:element"
  | "registry:component"
  | "registry:layout"
  | "registry:motion"
  | "registry:brand";

/** Optional `add <category> <name>` sugar — the bare words behind each type.
 *  `brand` ((internal ADR)) is a theme token set served by an org registry. */
export const CATEGORIES = ["chart", "hook", "element", "component", "layout", "motion", "brand"] as const;

const TYPES = new Set<string>(CATEGORIES.map((c) => `registry:${c}`));

export interface RegistryItemFile {
  /** Path within the registry root to read the source from (e.g. `files/charts/X.tsx`). */
  path: string;
  /** Category of this file (routing / UX). */
  type: RegistryItemType;
  /** Deck-relative destination the source is written to — owned by the user thereafter. */
  target: string;
}

export interface RegistryItem {
  name: string;
  type: RegistryItemType;
  version: string;
  description?: string;
  /** npm leaf dependencies added to the deck's package.json (e.g. `@visx/scale`). */
  dependencies?: string[];
  /** Other registry items (owned source) scaffolded alongside this one. */
  registryDependencies?: string[];
  files: RegistryItemFile[];
  /** Agent-facing usage metadata ((internal ADR)) — does not affect scaffolding. */
  meta?: RegistryItemMeta;
}

/**
 * Agent-facing metadata ((internal ADR)): terse TS-shaped strings so an agent can wire a
 * component without reading its source. `dataShape` is the headline — the type of the
 * primary data prop a chart expects (e.g. `{ label: string; value: number }[]`).
 */
export interface RegistryItemMeta {
  /** The exported symbol(s) the item provides, e.g. "BarChart". */
  exports?: string;
  /** The component's props, as a terse TS-ish string. */
  props?: string;
  /** The shape of the primary `data` prop, as a terse TS-ish string. */
  dataShape?: string;
  /** A one-line usage example the agent can copy. */
  example?: string;
}

export interface RegistryIndex {
  name: string;
  homepage?: string;
  items: Array<Pick<RegistryItem, "name" | "type" | "version" | "description">>;
}

/** Throws if `target` could escape the deck root (absolute, drive-letter, or `..`). */
export function assertSafeTarget(target: string): void {
  if (!target || target.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(target)) {
    throw new Error(`unsafe target path "${target}" — must be deck-relative`);
  }
  if (target.split(/[\\/]/).includes("..")) {
    throw new Error(`unsafe target path "${target}" — must not contain ".."`);
  }
}

/** Validates a registry item against the contract + safety gate. Throws on any violation. */
export function validateItem(item: unknown): asserts item is RegistryItem {
  const it = item as Partial<RegistryItem> | null;
  if (!it || typeof it.name !== "string" || !it.name) {
    throw new Error("registry item: missing name");
  }
  if (typeof it.type !== "string" || !TYPES.has(it.type)) {
    throw new Error(`registry item "${it.name}": invalid type "${(it as RegistryItem).type}"`);
  }
  if (typeof it.version !== "string" || !it.version) {
    throw new Error(`registry item "${it.name}": missing version`);
  }
  if (!Array.isArray(it.files) || it.files.length === 0) {
    throw new Error(`registry item "${it.name}": no files`);
  }
  for (const f of it.files) {
    if (!f || typeof f.path !== "string" || typeof f.target !== "string") {
      throw new Error(`registry item "${it.name}": malformed file entry`);
    }
    assertSafeTarget(f.target);
  }
  // Bundler safety is enforced by actually bundling the item's source — see
  // `verifyBundles` — not by inspecting the dependency list here.
}
