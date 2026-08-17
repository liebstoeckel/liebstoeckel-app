#!/usr/bin/env bun
import { defineCommand, runMain } from "citty";
import { looksLikeDeck } from "./targeting";

// The umbrella dispatches in-process to one citty command per subcommand ((internal ADR):
// uniform deck targeting, (internal ADR): agent-readable surface). Heavy command modules
// are imported lazily, a subCommand is a `() => import(...)` thunk, so e.g. `build`
// never loads the live server and `live` never loads the bundler until invoked.
const rootCommand = defineCommand({
  meta,
  subCommands: {
    new: () => import("./new").then((m) => m.newCommand),
    add: () => import("./add").then((m) => m.addCommand),
    registry: () => import("./registry").then((m) => m.registryCommand),
    build: () => import("./build").then((m) => m.buildCommand),
    eject: () => import("./build").then((m) => m.ejectCommand),
    pack: () => import("./build").then((m) => m.packCommand),
    licenses: () => import("./build").then((m) => m.licensesCommand),
    // dev-server is a declared dependency, but keep the import dynamic and
    // soft: the packages depend on each other (dev-server uses the CLI's
    // migration registry), and the catch turns a broken or partial install
    // into a clear notice instead of taking every other command down with it.
    dev: () =>
      import("@liebstoeckel/dev-server/cli").then((m) => m.devCommand).catch(() =>
        defineCommand({
          meta: { name: "dev", description: "dev mode (hot reload + the annotation drawer)" },
          run() {
            console.error("`liebstoeckel dev` could not load @liebstoeckel/dev-server; the install looks incomplete. Try reinstalling (`bun install`).");
            process.exit(1);
          },
        }),
      ),
    live: () => import("@liebstoeckel/live-server/cli").then((m) => m.liveCommand),
    relay: () => import("@liebstoeckel/present-relay/cli").then((m) => m.relayCommand),
    thumbs: () => import("@liebstoeckel/thumbnails/cli").then((m) => m.thumbsCommand),
    export: () => import("@liebstoeckel/thumbnails/cli").then((m) => m.exportCommand),
    skill: () => import("./skill").then((m) => m.skillCommand),
    update: () => import("./update-cmd").then((m) => m.updateCommand),
    doctor: () => import("./doctor").then((m) => m.doctorCommand),
    // cloud (coming soon, the hosted service is not generally available yet):
    login: () => import("./cloud").then((m) => m.loginCommand),
    push: () => import("./cloud").then((m) => m.pushCommand),
    orgs: () => import("./cloud").then((m) => m.orgsCommand),
    decks: () => import("./cloud").then((m) => m.decksCommand),
    brand: () => import("./cloud").then((m) => m.brandCommand),
  },
});

/** Root meta with the live CLI version, so `liebstoeckel --version` and the usage
 *  header report it. A function so the version (read from package.json) is resolved
 *  only when help/version is rendered. */
async function meta() {
  const { cliVersion } = await import("./skill");
  return {
    name: "liebstoeckel",
    version: await cliVersion(),
    description: "code-first presentations, author decks in MDX + TSX, build one self-contained .html (alias: lst)",
  };
}

/** The subcommand names that win over the `liebstoeckel <deck>` → `live` shorthand. */
const KNOWN_COMMANDS = new Set(Object.keys((rootCommand.subCommands as Record<string, unknown>) ?? {}));

async function main() {
  const argv = process.argv.slice(2);

  // Preflight on every run: confirm the Bun interpreting this CLI satisfies
  // engines.bun. The same binary (bunBin === process.execPath) backs every
  // shell-out below, so this gate covers exactly what `build` etc. will use,
  // a too-old Bun otherwise fails deep inside a command with an opaque error.
  const { assertBunVersion } = await import("./bun");
  await assertBunVersion();

  // Feed a `doctor`-recorded Chromium into the resolution order when the user
  // hasn't set LIEBSTOECKEL_CHROMIUM, so a browser configured once is reused.
  try {
    await (await import("./config")).hydrateChromiumEnv();
  } catch {
    // never block a command on config
  }

  // Best-effort, stderr-only (see update.ts): a cached "new CLI version" note
  // (off for --json/pipes/CI), and the skill self-heal, which rewrites a stale
  // installed skill in place (all modes; the installed skill is a pure function
  // of the CLI version, so refreshing it needs no consent).
  try {
    const { updateReminder, healSkills } = await import("./update");
    const dirIdx = argv.indexOf("--dir");
    const deckDir = dirIdx >= 0 ? argv[dirIdx + 1] ?? "." : ".";
    await updateReminder(argv);
    await healSkills(deckDir);
  } catch {
    // neither may ever break a command
  }

  // Shorthand: `liebstoeckel <deck>` → `liebstoeckel live <deck>`. citty's subcommand
  // router throws on an unknown leading positional, so resolve the shorthand here by
  // injecting `live` before handing off (an unknown non-deck token still falls through
  // to citty's "Unknown command" usage error).
  const firstPositional = argv.find((a) => !a.startsWith("-"));
  let rawArgs = argv;
  if (firstPositional && !KNOWN_COMMANDS.has(firstPositional) && looksLikeDeck(firstPositional)) {
    rawArgs = ["live", ...argv];
  }
  // Bare invocation → show the command surface (citty would otherwise error).
  if (rawArgs.length === 0) rawArgs = ["--help"];

  await runMain(rootCommand, { rawArgs });
}

if (import.meta.main) void main();
