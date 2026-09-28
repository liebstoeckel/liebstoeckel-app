#!/usr/bin/env bun
import { defineCommand, runMain } from "citty";
import { looksLikeDeck } from "./targeting";

// The umbrella dispatches in-process to one citty command per subcommand ((internal ADR):
// uniform deck targeting, (internal ADR): agent-readable surface). Heavy command modules
// are imported lazily, a subCommand is a `() => import(...)` thunk, so e.g. `build`
// never loads the live server and `live` never loads the bundler until invoked.
export const rootCommand = defineCommand({
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
    // The real error is kept and printed by the fallback (never swallowed):
    // only a genuine module-not-found gets the "install looks incomplete"
    // hint; anything else (a syntax error, a throwing top-level import) is
    // shown as-is, with the stack under LIEBSTOECKEL_DEBUG.
    dev: () =>
      import("@liebstoeckel/dev-server/cli").then((m) => m.devCommand).catch((err: unknown) =>
        // Accepts any option: the real `dev` options are unknown here, and the
        // load failure is the message worth showing.
        Object.assign(defineCommand({
          meta: { name: "dev", description: "dev mode (hot reload + the annotation sidebar beside the deck)" },
          run() {
            console.error(devLoadFailureMessage(err));
            if (process.env.LIEBSTOECKEL_DEBUG && err instanceof Error && err.stack) console.error(err.stack);
            process.exit(1);
          },
        }), { acceptsAnyOption: true }),
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
    pull: () => import("./cloud").then((m) => m.pullCommand),
    sync: () => import("./cloud").then((m) => m.syncCommand),
    orgs: () => import("./cloud").then((m) => m.orgsCommand),
    decks: () => import("./cloud").then((m) => m.decksCommand),
    brand: () => import("./cloud").then((m) => m.brandCommand),
  },
});

/** Is this load failure a missing module (vs. a module that loaded and threw)?
 *  Bun reports unresolvable imports as a ResolveMessage (name "ResolveMessage",
 *  no `code`); Node-style errors carry ERR_MODULE_NOT_FOUND / MODULE_NOT_FOUND. */
export function isModuleNotFound(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const { code, name, message } = err as { code?: unknown; name?: unknown; message?: unknown };
  if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") return true;
  if (name === "ResolveMessage") return true;
  return typeof message === "string" && /cannot (find|resolve) (module|package)/i.test(message);
}

/** What the `dev` fallback command prints when @liebstoeckel/dev-server failed to load. */
export function devLoadFailureMessage(err: unknown): string {
  const detail = err instanceof Error ? err.message : String(err);
  const hint = isModuleNotFound(err)
    ? "the install looks incomplete. Try reinstalling (`bun install`)."
    : "it loaded but failed. Set LIEBSTOECKEL_DEBUG=1 for the stack.";
  return `\`liebstoeckel dev\` could not load @liebstoeckel/dev-server; ${hint}\n  ${detail}`;
}

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

/** Exit 2 on any option the routed command does not declare (with a close
 *  match when there is one). JSON error document on stdout when the command
 *  has a JSON mode and it is on, prose on stderr otherwise. */
async function refuseUnknownOptions(rawArgs: string[]): Promise<void> {
  if (rawArgs.includes("--help") || rawArgs.includes("-h")) return;
  const { findUnknownOptions } = await import("./options");
  const { unknown, leaf } = await findUnknownOptions(rootCommand, rawArgs);
  if (unknown.length === 0) return;
  const { CliError, fail, wantsJson } = await import("./output");
  const first = unknown[0]!;
  // `dev poll` only speaks JSON; `dev` (a server) prints JSON only when asked.
  const route = leaf.path.join(" ");
  const flag = rawArgs.includes("--json") ? true : rawArgs.includes("--no-json") ? false : undefined;
  const json = route === "dev poll" || ("json" in leaf.args && (route === "dev" ? flag === true : wantsJson(flag)));
  const names = unknown.map((u) => u.option).join(", ");
  fail(
    json,
    new CliError(`unknown option${unknown.length > 1 ? "s" : ""} ${names} for \`${first.command}\``, {
      code: "unknown_option",
      hint: first.suggestion ? `did you mean ${first.suggestion}? (see \`${first.command} --help\`)` : `see \`${first.command} --help\``,
      exit: 2,
    }),
  );
}

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

  // Refuse options the command does not declare, before anything with a side
  // effect runs (the update notice, the skill self-heal, the command itself):
  // citty would drop them silently, and a dropped `--json` changes the output.
  await refuseUnknownOptions(rawArgs);

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

  await runMain(rootCommand, { rawArgs });
}

// Top-level await, never a floating `void main()`: on Bun 1.4.0 for Windows a
// rejecting Bun.file() read inside an un-awaited promise drops the event loop's
// last reference, so the process exits 0 mid-command with no output at all.
// Awaiting here keeps module evaluation (and the process) alive for the whole run.
if (import.meta.main) await main();
