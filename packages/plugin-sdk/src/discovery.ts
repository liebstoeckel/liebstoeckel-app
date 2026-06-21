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
  liebstoeckel?: { client?: string; server?: string; id?: string; audienceWrites?: string[] };
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
