import { dirname, join } from "node:path";

export interface DiscoveredPlugin {
  name: string;
  version: string;
  dir: string;
  clientEntry?: string;
  serverEntry?: string;
  /** the plugin's runtime def id (e.g. "poll"), keys its state at `plugin:<id>`. */
  id?: string;
  /** state fields an audience peer may write live ((internal ADR)); everything else is
   *  presenter-only. Declared statically so the relay can enforce it without the def. */
  audienceWrites?: string[];
}

export interface PkgJson {
  name?: string;
  version?: string;
  keywords?: string[];
  dependencies?: Record<string, string>;
  liebstoeckel?: {
    client?: string;
    server?: string;
    id?: string;
    audienceWrites?: string[];
    /** A deck's own plugins (defined with `definePlugin` inside the deck, not installed
     *  as a package), by plugin id. Read from the deck's package.json only. */
    plugins?: Record<string, { audienceWrites?: unknown } | undefined>;
  };
}

/** A plugin defined inside the deck, as its package.json declares it. */
export interface DeckLocalPlugin {
  id: string;
  audienceWrites: string[];
}

/** Ids no plugin may take: the instance index lives at this doc root. */
const RESERVED_IDS = new Set(["plugin-index"]);

/** Pure: the deck's own plugins from `liebstoeckel.plugins` in its package.json, checked.
 *  A plugin installed as a package declares its audience fields in its own package.json;
 *  a plugin written inside the deck has none, so the deck names them:
 *  `"liebstoeckel": { "plugins": { "mood": { "audienceWrites": ["votes"] } } }`.
 *  `packageIds` are the ids of the deck's installed plugins: a deck entry may not reuse
 *  one, since it would replace that plugin's audience fields. Errors fail the build. */
export function deckLocalPlugins(
  pkg: PkgJson,
  packageIds: Iterable<string>,
): { plugins: DeckLocalPlugin[]; errors: string[] } {
  const raw = pkg.liebstoeckel?.plugins;
  const plugins: DeckLocalPlugin[] = [];
  const errors: string[] = [];
  if (raw === undefined) return { plugins, errors };
  const where = 'package.json "liebstoeckel.plugins"';
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { plugins, errors: [`${where} must be an object keyed by plugin id`] };
  }
  const taken = new Set(packageIds);
  for (const [id, entry] of Object.entries(raw)) {
    if (!id || id.includes(":") || RESERVED_IDS.has(id)) {
      errors.push(`${where}: "${id}" is not a usable plugin id`);
      continue;
    }
    if (taken.has(id)) {
      errors.push(`${where}: "${id}" is the id of an installed plugin package, which declares its own audience fields`);
      continue;
    }
    const fields = entry && typeof entry === "object" ? (entry as { audienceWrites?: unknown }).audienceWrites : undefined;
    if (fields === undefined) continue;
    if (!Array.isArray(fields) || fields.some((f) => typeof f !== "string" || !f)) {
      errors.push(`${where}.${id}.audienceWrites must be a list of state field names`);
      continue;
    }
    if (fields.length > 0) plugins.push({ id, audienceWrites: [...new Set(fields as string[])] });
  }
  return { plugins, errors };
}

export const PLUGIN_KEYWORD = "liebstoeckel-plugin";

/** Pure: is this package a liebstoeckel plugin, and what are its entries? */
export function classifyPlugin(pkg: PkgJson, dir: string): DiscoveredPlugin | null {
  const isPlugin = pkg.keywords?.includes(PLUGIN_KEYWORD) && !!pkg.liebstoeckel;
  if (!isPlugin || !pkg.name) return null;
  return {
    name: pkg.name,
    version: pkg.version ?? "0.0.0",
    dir,
    clientEntry: pkg.liebstoeckel!.client ? join(dir, pkg.liebstoeckel!.client) : undefined,
    serverEntry: pkg.liebstoeckel!.server ? join(dir, pkg.liebstoeckel!.server) : undefined,
    id: pkg.liebstoeckel!.id,
    audienceWrites: pkg.liebstoeckel!.audienceWrites,
  };
}

export type Lookup = (name: string) => { pkg: PkgJson; dir: string } | null;

/** Pure: classify each dependency via an injectable lookup. */
export function discoverFromDeps(deps: Record<string, string>, lookup: Lookup): DiscoveredPlugin[] {
  const out: DiscoveredPlugin[] = [];
  for (const name of Object.keys(deps)) {
    const found = lookup(name);
    if (!found) continue;
    const p = classifyPlugin(found.pkg, found.dir);
    if (p) out.push(p);
  }
  return out;
}

/** Filesystem lookup that resolves a dependency's package.json via Bun. */
export function fsLookup(fromFile: string): Lookup {
  return (name) => {
    try {
      const pkgPath = Bun.resolveSync(`${name}/package.json`, dirname(fromFile));
      const pkg = require(pkgPath) as PkgJson;
      return { pkg, dir: dirname(pkgPath) };
    } catch {
      return null;
    }
  };
}

/** Discover plugins from a deck's package.json on disk. */
export async function discoverFromPackageJson(pkgJsonPath: string): Promise<DiscoveredPlugin[]> {
  const pkg = (await Bun.file(pkgJsonPath).json()) as PkgJson;
  return discoverFromDeps(pkg.dependencies ?? {}, fsLookup(pkgJsonPath));
}
