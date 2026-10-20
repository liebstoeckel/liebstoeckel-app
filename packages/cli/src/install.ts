// `liebstoeckel install [package...]`: install a deck's dependencies, or add npm
// packages to it, with the Bun this CLI runs on. The CLI brings its own Bun, so a
// machine with only Node (or nothing but the CLI) has a package manager for its
// decks without installing Bun. Lifecycle scripts never run: a deck's
// dependencies (fonts, plugins, chart libraries) need none, and a deck from
// someone else must not run code just by being installed.
import { defineCommand } from "citty";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { bunBin } from "./bun";
import { CliError, fail, wantsJson } from "./output";

/** Pure: the Bun command line for an install (unit-tested). */
export function installArgs(packages: string[], dev: boolean): string[] {
  if (packages.length === 0) return [bunBin, "install", "--ignore-scripts"];
  return [bunBin, "add", "--ignore-scripts", ...(dev ? ["--dev"] : []), ...packages];
}

/** Run the install in `deckDir` with Bun's progress on stderr (stdout stays
 *  free for a JSON document). True on success. */
export async function runInstall(deckDir: string, packages: string[] = [], dev = false): Promise<boolean> {
  const proc = Bun.spawn(installArgs(packages, dev), { cwd: deckDir, stdin: "inherit", stdout: 2, stderr: "inherit" });
  return (await proc.exited) === 0;
}

export const installCommand = defineCommand({
  meta: {
    name: "install",
    description: "install the deck's dependencies, or add npm packages to it, with the CLI's own Bun",
  },
  args: {
    packages: {
      type: "positional",
      required: false,
      description: "npm packages to add (none: install what package.json lists)",
      valueHint: "package...",
    },
    dev: { type: "boolean", description: "add the packages as devDependencies" },
    dir: { type: "string", description: "target deck directory (default: cwd)", valueHint: "deck" },
    json: { type: "boolean", description: "machine-readable JSON output (default when piped)" },
  },
  async run({ args }) {
    const json = wantsJson(args.json);
    const deckDir = resolve(args.dir ?? ".");
    const packages = args._.map(String);
    if (!existsSync(join(deckDir, "package.json"))) {
      fail(
        json,
        new CliError(`no package.json in ${deckDir}`, {
          code: "not_a_deck",
          hint: "run it in a deck directory, or pass --dir <deck>",
        }),
      );
    }
    const ok = await runInstall(deckDir, packages, !!args.dev);
    if (!ok) {
      fail(
        json,
        new CliError(packages.length ? `could not add ${packages.join(", ")}` : "could not install the deck's dependencies", {
          code: "install_failed",
          hint: "see Bun's output above; check the package names and that the registry is reachable",
        }),
      );
    }
    if (json) console.log(JSON.stringify({ ok: true, action: "install", dir: deckDir, packages, dev: !!args.dev }));
    else console.error(packages.length ? `✓ added ${packages.join(", ")}` : `✓ dependencies installed in ${deckDir}`);
  },
});
