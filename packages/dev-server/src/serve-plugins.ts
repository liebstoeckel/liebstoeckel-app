import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BUN_PLUGIN_WAY_OUT, isScaffoldBunPlugin } from "@liebstoeckel/build";

// Decks scaffolded before the build core listed Bun bundler plugins in bunfig.toml
// ([serve.static] plugins: Tailwind, MDX, the visx fix) for Bun's dev server. The
// build core does that work itself now, so those entries are ignored. Any other
// Bun plugin there would have run in dev before and no longer does: that is a
// problem the dev server, `doctor` and `dev poll` name, with the way out.

export interface PluginProblem {
  /** The plugin as written in bunfig.toml. */
  plugin: string;
  message: string;
}

/** The plugin specifiers in the deck's bunfig.toml, or a problem when the file
 *  cannot be read as TOML. No bunfig.toml means no plugins. */
export function servePluginSpecs(deckDir: string): { plugins: string[]; problem?: PluginProblem } {
  const file = join(deckDir, "bunfig.toml");
  if (!existsSync(file)) return { plugins: [] };
  let parsed: { serve?: { static?: { plugins?: unknown } } };
  try {
    parsed = Bun.TOML.parse(readFileSync(file, "utf-8")) as typeof parsed;
  } catch (err) {
    return { plugins: [], problem: { plugin: "bunfig.toml", message: `is not valid TOML: ${err instanceof Error ? err.message : String(err)}` } };
  }
  const raw = parsed?.serve?.static?.plugins;
  if (raw === undefined) return { plugins: [] };
  const list = Array.isArray(raw) ? raw : [raw];
  return { plugins: list.filter((p): p is string => typeof p === "string") };
}

/** The [serve.static] plugins the build core does not run (everything but the
 *  ones the scaffold wrote). Reads the file only; runs nothing. */
export function checkServePlugins(deckDir: string): PluginProblem[] {
  const { plugins, problem } = servePluginSpecs(deckDir);
  if (problem) return [problem];
  return plugins.filter((p) => !isScaffoldBunPlugin(p)).map((plugin) => ({ plugin, message: "is a Bun plugin, which liebstoeckel no longer runs" }));
}

/** One problem as a sentence fragment, e.g. `bunfig.toml plugin "x" is a Bun plugin, ...`. */
export function describePluginProblem(p: PluginProblem): string {
  return p.plugin === "bunfig.toml" ? `bunfig.toml ${p.message}` : `bunfig.toml plugin "${p.plugin}" ${p.message}`;
}

/** The fix for any plugin problem, without a trailing period. */
export function pluginProblemFix(_deckDir: string): string {
  return `remove it from [serve.static] plugins in bunfig.toml (${BUN_PLUGIN_WAY_OUT})`;
}

/** One line per problem plus the fix, for the terminal. */
export function formatPluginProblems(deckDir: string, problems: PluginProblem[]): string[] {
  return [
    ...problems.map(describePluginProblem),
    `the deck page shows this until it is fixed: ${pluginProblemFix(deckDir)}; the dev server picks up the change without a restart`,
  ];
}
