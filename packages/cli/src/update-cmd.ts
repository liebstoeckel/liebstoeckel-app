import { defineCommand } from "citty";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { bunBin } from "./bun";
import { cliVersion } from "./skill";
import { PKG, bunGlobalDir, fetchLatestVersion, installedSkillVersion, isNewer, writeCheckState } from "./update";

export { bunGlobalDir };

/**
 * `liebstoeckel update`, one command that leaves a user fully current: the
 * deck's @liebstoeckel/* dependencies, a global CLI install, and every
 * installed copy of the agent skill, whichever of those shapes apply.
 *
 * The dependency updates run through `bun`, so registry resolution matches
 * installs exactly. Deck updates name the exact @liebstoeckel/* packages the
 * deck declares (never a bare `--latest`, which would also bump the user's
 * other dependencies). The skill refresh is spawned from the FRESHLY installed
 * CLI, not this process: after `bun update` the files on disk are the new
 * version while this process still holds the old one, and re-reading replaced
 * files from a stale module tree is exactly the race to avoid.
 */

const SCOPE = "@liebstoeckel/";

// Where the running CLI's source lives (this file), for the install-shape probes.
const CLI_SRC_PATH = fileURLToPath(import.meta.url);
// The spawnable entrypoint next to it. Never spawn CLI_SRC_PATH itself: this
// module has no import.meta.main dispatch, so `bun update-cmd.ts skill update`
// would evaluate the module and exit 0 having done nothing.
const CLI_ENTRY = fileURLToPath(new URL("./cli.ts", import.meta.url));


/** Pure: the project root a node_modules-installed CLI belongs to, or null for
 *  anything else (a repo checkout, a bunx cache). This is the scaffold shape:
 *  `bun add @liebstoeckel/cli` at a project root with decks in subdirectories,
 *  where the CLI is neither deck-declared nor global. */
export function cliInstallRoot(cliSrcPath: string): string | null {
  const marker = sep + join("node_modules", "@liebstoeckel", "cli") + sep;
  const i = cliSrcPath.lastIndexOf(marker);
  return i > 0 ? cliSrcPath.slice(0, i) : null;
}

type PkgJson = { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null;

const scopeDeps = (pkg: PkgJson): string[] =>
  pkg
    ? [...new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})])]
        .filter((d) => d.startsWith(SCOPE))
        .sort()
    : [];

export interface UpdatePlan {
  /** The @liebstoeckel/* deps the deck declares (empty: no deck-local update). */
  deckDeps: string[];
  /** Whether the running CLI is a `bun add -g` install to update in place. */
  global: boolean;
  /** The project root holding the running CLI when that is a separate,
   *  package.json-declared install (the scaffold shape); null otherwise. */
  hostRoot: string | null;
  /** The @liebstoeckel/* deps that host root declares. */
  hostDeps: string[];
  /** Set when the running CLI's install cannot be updated by this command
   *  (installed under a root that does not declare it): the honest warning
   *  that replaces a false "✓ update complete". */
  unmanagedCli: string | null;
}

/** Pure: decide what an `update` run touches, from the deck's package.json,
 *  where the running CLI's source lives, and (when the CLI belongs to a
 *  separate project root) that root's package.json. Shapes can combine; only
 *  "nothing at all to act on" is an error. */
export function planUpdate(opts: {
  deckPkg: PkgJson;
  cliSrcPath: string;
  globalDir: string;
  deckRoot?: string;
  hostRoot?: string | null;
  hostPkg?: PkgJson;
}): UpdatePlan | { error: string } {
  const deckDeps = scopeDeps(opts.deckPkg);
  const global = opts.cliSrcPath.startsWith(opts.globalDir + sep);
  // The CLI's own install root matters only when it is a distinct project: a
  // global install is handled by the global path, and a hostRoot equal to the
  // deck is already covered by deckDeps.
  const hostRoot = !global && opts.hostRoot && opts.hostRoot !== opts.deckRoot ? opts.hostRoot : null;
  const hostDeps = hostRoot ? scopeDeps(opts.hostPkg ?? null) : [];
  const cliManaged = global || deckDeps.includes(PKG) || hostDeps.includes(PKG);
  const unmanagedCli = cliManaged
    ? null
    : `the running CLI (${opts.cliSrcPath}) is not managed by this command; update it yourself, e.g. \`bun add ${PKG}@latest\` where it is installed`;
  if (deckDeps.length === 0 && hostDeps.length === 0 && !global) {
    return {
      error:
        "nothing to update here: no @liebstoeckel/* dependencies declared at the target directory " +
        "or the CLI's own install root, and the running CLI is not a global install. " +
        "Run inside a deck, or pass --dir <deck>.",
    };
  }
  return { deckDeps, global, hostRoot, hostDeps, unmanagedCli };
}

/** Pure: which scope packages resolved to more than one version. `bun update`
 *  only re-resolves the named targets, so a dependent published against an older
 *  release can keep a stale nested copy that a fresh resolve would collapse;
 *  releases normally bump dependents in lockstep with their dependency, so this
 *  is rare, but when it happens the build can silently run the older copy. */
export function duplicateScopeVersions(copies: Array<{ name: string; version: string }>): Map<string, string[]> {
  const byName = new Map<string, Set<string>>();
  for (const c of copies) (byName.get(c.name) ?? byName.set(c.name, new Set()).get(c.name)!).add(c.version);
  const dups = new Map<string, string[]>();
  for (const [name, versions] of byName) if (versions.size > 1) dups.set(name, [...versions].sort());
  return dups;
}

/** Every resolved @liebstoeckel/* copy under the deck: top-level plus copies
 *  nested one level under another scope package (where bun places a conflicting
 *  resolution). Best-effort IO; unreadable entries are skipped. */
async function collectScopeCopies(deckRoot: string): Promise<Array<{ name: string; version: string }>> {
  const out: Array<{ name: string; version: string }> = [];
  const scopeDir = (base: string) => join(base, "node_modules", "@liebstoeckel");
  const read = async (dir: string, nestInto: boolean) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      try {
        const pkg = (await Bun.file(join(dir, entry, "package.json")).json()) as { name?: string; version?: string };
        if (pkg.name && pkg.version) out.push({ name: pkg.name, version: pkg.version });
      } catch {
        // not a readable package
      }
      if (nestInto) await read(scopeDir(join(dir, entry)), false);
    }
  };
  await read(scopeDir(deckRoot), true);
  return out;
}

type DeckPkg = Parameters<typeof planUpdate>[0]["deckPkg"];

async function readDeckPkg(deckRoot: string): Promise<DeckPkg> {
  try {
    const p = join(deckRoot, "package.json");
    if (!existsSync(p)) return null;
    return (await Bun.file(p).json()) as DeckPkg;
  } catch {
    return null;
  }
}

/** Run a child with inherited stdio; true on exit 0. */
async function run(cmd: string[], cwd?: string): Promise<boolean> {
  const proc = Bun.spawn(cmd, { cwd, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  return (await proc.exited) === 0;
}

/** Refresh installed skill copies via the freshly installed CLI (see module doc).
 *  `freshCli` is the new install's cli.ts; falls back to this process's own
 *  entrypoint for a global-only shape (same path, new bytes after `bun add -g`).
 *  A failed child is reported, not swallowed: a silent no-op here is exactly how
 *  a skill quietly stays stale. */
async function refreshSkills(freshCli: string, deckRoot: string): Promise<void> {
  // The child would race this parent's own reminder/heal hook; silence it.
  const env = { ...process.env, LIEBSTOECKEL_NO_UPDATE_CHECK: "1" };
  const spawnSkill = async (args: string[]) => {
    const proc = Bun.spawn([bunBin, freshCli, "skill", "update", ...args], {
      env,
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
    });
    if ((await proc.exited) !== 0) {
      console.error(`! skill refresh failed (${["skill", "update", ...args].join(" ")}); run it yourself with the updated CLI`);
    }
  };
  if (await installedSkillVersion(deckRoot)) await spawnSkill(["--dir", deckRoot, "--scope", "project"]);
  const home = process.env.HOME || homedir();
  if (resolve(deckRoot) !== home && (await installedSkillVersion(home))) await spawnSkill(["--scope", "user"]);
}

export const updateCommand = defineCommand({
  meta: {
    name: "update",
    description: "update the deck's @liebstoeckel/* packages and/or a global CLI install, then refresh the agent skill",
  },
  args: {
    dir: { type: "string", description: "target deck directory (default: cwd)", valueHint: "deck" },
  },
  async run({ args }) {
    const deckRoot = resolve(args.dir ?? ".");
    const hostRoot = cliInstallRoot(CLI_SRC_PATH);
    const plan = planUpdate({
      deckPkg: await readDeckPkg(deckRoot),
      cliSrcPath: CLI_SRC_PATH,
      globalDir: bunGlobalDir(),
      deckRoot,
      hostRoot,
      hostPkg: hostRoot ? await readDeckPkg(hostRoot) : null,
    });
    if ("error" in plan) {
      console.error(`✕ ${plan.error}`);
      process.exit(1);
    }

    // The user asked: check the registry live (never the cache) and record the
    // answer so the background reminder agrees with what we just learned.
    const current = await cliVersion();
    const latest = fetchLatestVersion();
    if (latest) {
      await writeCheckState(latest);
      console.error(
        isNewer(latest, current)
          ? `↑ ${PKG} ${latest} is available (you run ${current})`
          : `✓ ${PKG} is current (${current})`,
      );
    } else {
      console.error(`! could not reach the registry for ${PKG}, attempting the update anyway`);
    }

    // --no-cache on every bun spawn: right after a release, bun's manifest cache
    // still serves the previous dist-tags for minutes, and an update the user
    // explicitly asked for must see the registry's current truth.
    let ok = true;
    if (plan.deckDeps.length > 0) {
      console.error(`updating ${plan.deckDeps.length} @liebstoeckel/* package(s) in ${deckRoot}`);
      ok = (await run([bunBin, "update", "--latest", "--no-cache", ...plan.deckDeps], deckRoot)) && ok;
    }
    if (plan.hostRoot && plan.hostDeps.length > 0) {
      console.error(`updating ${plan.hostDeps.length} @liebstoeckel/* package(s) in ${plan.hostRoot} (the CLI's install root)`);
      ok = (await run([bunBin, "update", "--latest", "--no-cache", ...plan.hostDeps], plan.hostRoot)) && ok;
    }
    if (plan.global) {
      console.error(`updating the global CLI install`);
      ok = (await run([bunBin, "add", "-g", "--no-cache", `${PKG}@latest`])) && ok;
    }
    if (!ok) {
      console.error(`✕ update failed, see the output above`);
      process.exit(1);
    }
    if (plan.unmanagedCli) console.error(`! ${plan.unmanagedCli}`);

    // Refresh from the freshest CLI available: the deck's, else the CLI's own
    // just-updated install root, else this install's entrypoint (a global shape
    // re-runs the same path, which `bun add -g` has just replaced on disk).
    const cliAt = (root: string) => join(root, "node_modules", "@liebstoeckel", "cli", "src", "cli.ts");
    const deckCli = cliAt(deckRoot);
    const hostCli = plan.hostRoot ? cliAt(plan.hostRoot) : null;
    const freshCli =
      plan.deckDeps.includes(PKG) && existsSync(deckCli)
        ? deckCli
        : hostCli && plan.hostDeps.includes(PKG) && existsSync(hostCli)
          ? hostCli
          : CLI_ENTRY;
    await refreshSkills(freshCli, deckRoot);

    for (const root of new Set([plan.deckDeps.length > 0 ? deckRoot : null, plan.hostDeps.length > 0 ? plan.hostRoot : null])) {
      if (!root) continue;
      const dups = duplicateScopeVersions(await collectScopeCopies(root));
      if (dups.size > 0) {
        console.error(`! some @liebstoeckel/* packages resolved to more than one version:`);
        for (const [name, versions] of dups) console.error(`    ${name}: ${versions.join(", ")}`);
        console.error(
          `  a stale nested copy survives targeted updates; collapse to one version with:\n` +
            `    cd ${root} && rm -rf node_modules bun.lock && bun install`,
        );
      }
    }

    console.error(`✓ update complete`);
  },
});
