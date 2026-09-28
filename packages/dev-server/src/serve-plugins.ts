import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Bun loads the bundler plugins named in the deck's bunfig.toml
// ([serve.static] plugins) lazily, on the first request for the deck page. A
// plugin that does not resolve there ends the whole process (dev UI, live
// mirror and all) after the URL was already printed. Resolving them up front
// lets the dev server report the problem and keep running instead.

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

/** Resolve every [serve.static] plugin from the deck folder, the way Bun does
 *  when it serves the deck. Only resolves, never imports: running plugin code
 *  here would be earlier than Bun does it, and a failed import can stay cached,
 *  which would keep the check failing after the user fixed the install. */
export function checkServePlugins(deckDir: string): PluginProblem[] {
  const { plugins, problem } = servePluginSpecs(deckDir);
  if (problem) return [problem];
  const problems: PluginProblem[] = [];
  for (const plugin of plugins) {
    try {
      Bun.resolveSync(plugin, deckDir);
    } catch {
      problems.push({ plugin, message: `cannot be found from ${deckDir}` });
    }
  }
  return problems;
}

/** One problem as a sentence fragment, e.g. `bunfig.toml plugin "x" cannot be found from /deck`. */
export function describePluginProblem(p: PluginProblem): string {
  return p.plugin === "bunfig.toml" ? `bunfig.toml ${p.message}` : `bunfig.toml plugin "${p.plugin}" ${p.message}`;
}

/** The fix for any plugin problem, without a trailing period. */
export function pluginProblemFix(deckDir: string): string {
  return `run \`bun install\` in ${deckDir} (or correct [serve.static] plugins in bunfig.toml)`;
}

/** One line per problem plus the fix, for the terminal. */
export function formatPluginProblems(deckDir: string, problems: PluginProblem[]): string[] {
  return [
    ...problems.map(describePluginProblem),
    `the deck page shows an error until this is fixed: ${pluginProblemFix(deckDir)}; the page picks it up without a restart`,
  ];
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** The page served in place of the deck while a plugin is missing. It asks
 *  `statusUrl` every two seconds and reloads once the plugins resolve. */
export function pluginErrorPage(deckDir: string, problems: PluginProblem[], statusUrl: string): string {
  const items = problems
    .map((p) => `<li><code>${escapeHtml(p.plugin)}</code> ${escapeHtml(p.message)}</li>`)
    .join("");
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    "<title>Deck cannot be served</title>" +
    "<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#10140e;color:#e8e6df;" +
    "font:16px/1.5 system-ui,sans-serif}main{max-width:40rem;padding:2rem}h1{font-size:1.25rem;margin:0 0 1rem}" +
    "code{font-family:ui-monospace,monospace;background:#1d231a;padding:.1em .35em;border-radius:4px}" +
    "p.wait{color:#9a9a8f;font-size:.875rem}</style></head><body><main>" +
    "<h1>The deck cannot be served: a bundler plugin is missing</h1>" +
    `<p>The <code>[serve.static] plugins</code> in <code>bunfig.toml</code> could not be loaded:</p><ul>${items}</ul>` +
    `<p>Run <code>bun install</code> in <code>${escapeHtml(deckDir)}</code>, or correct the plugin list in <code>bunfig.toml</code>.</p>` +
    '<p class="wait">This page reloads by itself once the plugins resolve. The dev server keeps running.</p>' +
    "</main><script>" +
    `setInterval(function(){fetch(${JSON.stringify(statusUrl)},{cache:"no-store"}).then(function(r){return r.json()})` +
    ".then(function(s){if(s&&s.ok)location.reload()}).catch(function(){})},2000)" +
    "</script></body></html>"
  );
}
