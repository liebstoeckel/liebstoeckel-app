// Build profiles: one implementation, two settings.
//
// - `local` (the CLI, `liebstoeckel dev`, any deck on a developer's machine): the
//   build reads anything under the project's tree; the code step stands in for the
//   `codeStory`/`code` macro; any other macro import, a Tailwind JavaScript plugin
//   and Bun bundler plugins in bunfig.toml are errors that name the file.
// - `hosted` (the preview and the assistant in the sandbox): the same, plus a gate
//   on every read (the deck, the trusted trees, the deck's packages), the
//   stylesheet rule on deck and package CSS, and the deck's own package.json may
//   not redirect imports (`exports`, `imports`, `browser`).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cssProblem } from "./core/css-gate.ts";
import { gatedFiles, type Files } from "./core/files.ts";
import type { ResolverOptions } from "./core/resolve.ts";
import { DiskFiles, projectRoot } from "./disk.ts";

export interface HostedSettings {
  /** The folder holding the deck (real path); its subfolders are its files. */
  deckRoot: string;
  /** Trusted trees (real paths): the framework packages and the host's node_modules. */
  trustedRoots: string[];
  /** Where the decks' third-party packages are unpacked (real path). */
  packagesRoot?: string;
}

export type Profile = { name: "local" } | ({ name: "hosted" } & HostedSettings);

export const LOCAL: Profile = { name: "local" };

export interface DeckTree {
  disk: DiskFiles;
  files: Files;
  resolver: ResolverOptions;
  /** the deck folder, virtual */
  deck: string;
}

/** The Files and resolver settings a profile builds a deck with. */
export function deckTree(deckDir: string, profile: Profile = LOCAL, root = projectRoot(deckDir)): DeckTree {
  const disk = new DiskFiles(root);
  const deck = disk.virtual(deckDir);
  if (deck === null) throw new Error(`${deckDir} is outside ${root}`);
  if (profile.name === "local") return { disk, files: disk, resolver: {}, deck };
  const v = (p: string) => {
    const out = disk.virtual(p);
    if (out === null) throw new Error(`${p} is outside ${root}`);
    return out;
  };
  const deckRoot = v(profile.deckRoot);
  const packagesRoot = profile.packagesRoot ? v(profile.packagesRoot) : undefined;
  const files = gatedFiles(disk, {
    deckRoot,
    trustedRoots: profile.trustedRoots.map(v),
    packagesRoot,
    cssProblem: (css, file, scope) => cssProblem(disk, css, file, scope),
  });
  // The deck's own package.json (and any under it outside node_modules) cannot redirect.
  const inDeck = (dir: string) => (dir === deckRoot || dir.startsWith(deckRoot + "/")) && !dir.includes("/node_modules/") && !(packagesRoot && dir.startsWith(packagesRoot + "/"));
  return { disk, files, resolver: { redirects: (dir) => !inDeck(dir) }, deck };
}

/** The bundler plugins a scaffolded deck used to list in bunfig.toml, for Bun's
 *  dev server. The build does their work itself now, so they are simply ignored. */
const KNOWN_PLUGINS = new Set(["bun-plugin-tailwind", "@liebstoeckel/engine/mdx-plugin", "@liebstoeckel/engine/visx-esm-plugin"]);
const IN_REPO_PLUGIN = /^(\.\.\/)+packages\/engine\/src\/build\/(mdx|visx-esm)-plugin(\.ts)?$/;

/** Whether a bunfig.toml plugin entry is one the scaffold wrote (now unused). */
export function isScaffoldBunPlugin(plugin: unknown): boolean {
  return typeof plugin === "string" && (KNOWN_PLUGINS.has(plugin) || IN_REPO_PLUGIN.test(plugin));
}

/** What to do about a Bun plugin the build no longer runs. */
export const BUN_PLUGIN_WAY_OUT =
  "liebstoeckel builds and serves decks with its own build core and no longer runs Bun plugins: remove the entry. " +
  "If the deck needs what the plugin did, do it in the deck's source instead (see https://docs.liebstoeckel.app/guides/building/#own-bun-plugins)";

export interface ToolingProblem {
  file: string;
  message: string;
}

/** A deck's bunfig.toml that asks for Bun bundler plugins the build does not run:
 *  each one as a problem that names it and the way out. */
export function bunfigProblems(deckDir: string): ToolingProblem[] {
  const file = join(deckDir, "bunfig.toml");
  if (!existsSync(file)) return [];
  let parsed: { serve?: { static?: { plugins?: unknown } } };
  try {
    parsed = Bun.TOML.parse(readFileSync(file, "utf-8")) as typeof parsed;
  } catch {
    return []; // not ours to judge; Bun itself reads this file for other settings
  }
  const raw = parsed?.serve?.static?.plugins;
  if (raw === undefined) return [];
  const problems: ToolingProblem[] = [];
  for (const plugin of Array.isArray(raw) ? raw : [raw]) {
    if (isScaffoldBunPlugin(plugin)) continue;
    problems.push({ file: "bunfig.toml", message: `lists the Bun plugin ${JSON.stringify(plugin)} under [serve.static] plugins. ${BUN_PLUGIN_WAY_OUT}` });
  }
  return problems;
}
