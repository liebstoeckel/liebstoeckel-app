import { defineCommand } from "citty";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { bunBin } from "./bun";
import { cliVersion } from "./skill";
import { PKG, fetchLatestVersion, installedSkillVersion, isNewer, writeCheckState } from "./update";

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

// Where the running CLI's source lives (this file), for the global-install probe.
const CLI_SRC_PATH = fileURLToPath(import.meta.url);

/** Bun's global-install root: `bun add -g` lands packages under
 *  `$BUN_INSTALL/install/global/node_modules`. */
export function bunGlobalDir(env: Record<string, string | undefined> = process.env): string {
  return join(env.BUN_INSTALL || join(env.HOME || homedir(), ".bun"), "install", "global");
}

export interface UpdatePlan {
  /** The @liebstoeckel/* deps the deck declares (empty: no deck-local update). */
  deckDeps: string[];
  /** Whether the running CLI is a `bun add -g` install to update in place. */
  global: boolean;
}

/** Pure: decide what an `update` run touches, from the deck's package.json and
 *  where the running CLI's source lives. Both shapes can apply at once; neither
 *  is an actionable error. */
export function planUpdate(opts: {
  deckPkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null;
  cliSrcPath: string;
  globalDir: string;
}): UpdatePlan | { error: string } {
  const deckDeps = opts.deckPkg
    ? [...new Set([...Object.keys(opts.deckPkg.dependencies ?? {}), ...Object.keys(opts.deckPkg.devDependencies ?? {})])]
        .filter((d) => d.startsWith(SCOPE))
        .sort()
    : [];
  const global = opts.cliSrcPath.startsWith(opts.globalDir + sep);
  if (deckDeps.length === 0 && !global) {
    return {
      error:
        "nothing to update here: the current directory declares no @liebstoeckel/* dependencies " +
        "and the running CLI is not a global install. Run inside a deck, or pass --dir <deck>.",
    };
  }
  return { deckDeps, global };
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
 *  `freshCli` is the new install's cli.ts; falls back to this process's own path
 *  for a global-only shape (same path, new bytes after `bun add -g`). */
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
    await proc.exited;
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
    const plan = planUpdate({
      deckPkg: await readDeckPkg(deckRoot),
      cliSrcPath: CLI_SRC_PATH,
      globalDir: bunGlobalDir(),
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
    if (plan.global) {
      console.error(`updating the global CLI install`);
      ok = (await run([bunBin, "add", "-g", "--no-cache", `${PKG}@latest`])) && ok;
    }
    if (!ok) {
      console.error(`✕ update failed, see the output above`);
      process.exit(1);
    }

    // Prefer the deck's freshly installed CLI; a global-only shape re-runs this
    // same path, which `bun add -g` has just replaced on disk.
    const deckCli = join(deckRoot, "node_modules", "@liebstoeckel", "cli", "src", "cli.ts");
    await refreshSkills(plan.deckDeps.length > 0 && existsSync(deckCli) ? deckCli : CLI_SRC_PATH, deckRoot);

    console.error(`✓ update complete`);
  },
});
