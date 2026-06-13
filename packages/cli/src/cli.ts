#!/usr/bin/env bun
import { defineCommand, runMain } from "citty";
import { looksLikeDeck } from "./targeting";

// The umbrella dispatches in-process to one citty command per subcommand ((internal ADR):
// uniform deck targeting, (internal ADR): agent-readable surface). Heavy command modules
// are imported lazily — a subCommand is a `() => import(...)` thunk, so e.g. `build`
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
    live: () => import("@liebstoeckel/live-server/cli").then((m) => m.liveCommand),
    relay: () => import("@liebstoeckel/present-relay/cli").then((m) => m.relayCommand),
    thumbs: () => import("@liebstoeckel/thumbnails/cli").then((m) => m.thumbsCommand),
    export: () => import("@liebstoeckel/thumbnails/cli").then((m) => m.exportCommand),
    skill: () => import("./skill").then((m) => m.skillCommand),
    // cloud (coming soon — the hosted service is not generally available yet):
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
    description: "code-first presentations — author decks in MDX + TSX, build one self-contained .html (alias: lst)",
  };
}

/** The subcommand names that win over the `liebstoeckel <deck>` → `live` shorthand. */
const KNOWN_COMMANDS = new Set(Object.keys((rootCommand.subCommands as Record<string, unknown>) ?? {}));

async function main() {
  const argv = process.argv.slice(2);

  // Best-effort reminders (stderr-only; off for --json/pipes/CI, see update.ts):
  // a cached "new CLI version" note and a "deck skill older than the CLI" note.
  try {
    const { updateReminder, skillReminder } = await import("./update");
    const dirIdx = argv.indexOf("--dir");
    const deckDir = dirIdx >= 0 ? argv[dirIdx + 1] ?? "." : ".";
    await updateReminder(argv);
    await skillReminder(deckDir, argv);
  } catch {
    // reminders must never break a command
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
