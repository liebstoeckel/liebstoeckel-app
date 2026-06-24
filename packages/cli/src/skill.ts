import { defineCommand } from "citty";
import { fileURLToPath } from "node:url";
import { existsSync, readdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

/**
 * `liebstoeckel skill install`, materialize the bundled `liebstoeckel-deck` Skill
 * into a deck for whichever agents the user runs ((internal ADR)). One canonical source
 * (shipped in this package, version-pinned to the CLI) is placed at each agent's
 * expected path, and a universal `AGENTS.md` block is written as the fallback for
 * agents with weak or no skill support.
 */

const SKILL_NAME = "liebstoeckel-deck";

// Canonical source: packages/cli/skill/ (this file is packages/cli/src/skill.ts).
const SKILL_SRC = fileURLToPath(new URL("../skill", import.meta.url));
const PKG_JSON = fileURLToPath(new URL("../package.json", import.meta.url));

type Target = "claude" | "codex" | "cursor" | "gemini";
const ALL_TARGETS: Target[] = ["claude", "codex", "cursor", "gemini"];

// Where each agent looks for a skill folder, relative to the root (a project dir
// for a `project` install, the home dir for a `user` install). Agents read the
// same `.<agent>/skills/...` layout under either root.
export const SKILL_DIR: Record<Target, string> = {
  claude: join(".claude", "skills", SKILL_NAME),
  codex: join(".agents", "skills", SKILL_NAME), // also read by Gemini's shared path
  cursor: join(".cursor", "skills", SKILL_NAME),
  gemini: join(".gemini", "skills", SKILL_NAME),
};

/** Where a skill install lands: a single project/deck, or the user account (every
 *  project). `project` writes the per-agent dirs + the AGENTS.md fallback into the
 *  deck root; `user` writes the per-agent dirs under `~` (e.g. `~/.claude/skills/`). */
export type Scope = "project" | "user";

/** Decide the install scope from the flags and context, or signal that the caller
 *  must prompt / error. Pure (no IO), so the policy is unit-tested:
 *   - `--global` or `--scope user|project` is taken as given;
 *   - an explicit `--dir` means "this project";
 *   - otherwise a TTY prompts, and a non-interactive run defaults to the project
 *     only when the cwd is actually a deck, never silently writing skill files
 *     into a random directory (the home-dir pollution from the field report). */
export function resolveScope(opts: {
  scopeArg?: string;
  global?: boolean;
  dirGiven: boolean;
  interactive: boolean;
  cwdIsDeck: boolean;
}): { scope: Scope } | { prompt: true } | { error: string } {
  if (opts.global) return { scope: "user" };
  if (opts.scopeArg) {
    if (opts.scopeArg === "project" || opts.scopeArg === "user") return { scope: opts.scopeArg };
    return { error: `unknown --scope "${opts.scopeArg}", use: project | user` };
  }
  if (opts.dirGiven) return { scope: "project" };
  if (opts.interactive) return { prompt: true };
  if (opts.cwdIsDeck) return { scope: "project" };
  return {
    error:
      "not inside a deck and no scope given. Pass `--scope user` to install for your account (~), " +
      "or `--dir <deck>` / `--scope project` to install into a project.",
  };
}

/** A directory is a deck/project if it has a package.json (decks are npm packages). */
function isDeckDir(dir: string): boolean {
  return existsSync(join(dir, "package.json"));
}

export async function cliVersion(): Promise<string> {
  try {
    return ((await Bun.file(PKG_JSON).json()) as { version?: string }).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** The skill's payload files (everything under skill/ except the AGENTS.md template). */
function skillFiles(): string[] {
  const out = ["SKILL.md"];
  const refs = join(SKILL_SRC, "references");
  if (existsSync(refs)) for (const f of readdirSync(refs)) out.push(join("references", f));
  return out;
}

/** Copy the skill into one destination, stamping the CLI version into SKILL.md. */
async function writeSkill(destRoot: string, version: string): Promise<void> {
  for (const rel of skillFiles()) {
    let content = await Bun.file(join(SKILL_SRC, rel)).text();
    if (rel === "SKILL.md") content = content.replace(/(\n\s*version:\s*).*/, `$1${version}`);
    const dest = join(destRoot, rel);
    await mkdir(dirname(dest), { recursive: true });
    await Bun.write(dest, content);
  }
}

const AGENTS_BLOCK_RE = /<!-- liebstoeckel:start -->[\s\S]*?<!-- liebstoeckel:end -->/;

/** Merge the managed liebstoeckel block into an AGENTS.md body: replace it in place
 *  if present (idempotent), else append it. Pure, the unit-test anchor. */
export function mergeAgentsBlock(existing: string, block: string): string {
  const b = block.trim();
  if (AGENTS_BLOCK_RE.test(existing)) return existing.replace(AGENTS_BLOCK_RE, b);
  return (existing.trim() ? `${existing.trim()}\n\n` : "") + b + "\n";
}

/** Write or replace the managed liebstoeckel block in the deck's AGENTS.md. */
async function writeAgentsBlock(deckDir: string): Promise<void> {
  const block = await Bun.file(join(SKILL_SRC, "AGENTS.md")).text();
  const path = join(deckDir, "AGENTS.md");
  const existing = existsSync(path) ? await Bun.file(path).text() : "";
  await Bun.write(path, mergeAgentsBlock(existing, block));
}

/** A small Cursor rule pointing at the placed skill (Cursor reads `.cursor/rules/*.mdc`). */
async function writeCursorRule(deckDir: string): Promise<void> {
  const mdc = `---
description: Use the liebstoeckel-deck skill to create or edit presentation decks (liebstoeckel CLI).
alwaysApply: false
---
When working on liebstoeckel presentation decks, follow ${join(".cursor", "skills", SKILL_NAME, "SKILL.md")}.
Discover components with \`liebstoeckel registry list --json\`; validate with \`liebstoeckel build --check\`.
`;
  const dest = join(deckDir, ".cursor", "rules", "liebstoeckel.mdc");
  await mkdir(dirname(dest), { recursive: true });
  await Bun.write(dest, mdc);
}

export async function applySkill(
  sub: "install" | "update",
  root: string,
  scope: Scope,
  targetArg: string | undefined,
): Promise<void> {
  // AGENTS.md is a project-root convention (the fallback an agent reads when it
  // opens a deck). A `user` install skips it. A bare `~/AGENTS.md` is the home-dir
  // pollution the field report flagged, and isn't a reliable global instruction path.
  const writeAgents = scope === "project";
  let targets: Target[];
  if (sub === "update") {
    // Refresh whatever is already installed (the AGENTS.md block is rewritten when
    // present); installing NEW agent paths stays `install`'s job.
    targets = ALL_TARGETS.filter((t) => existsSync(join(root, SKILL_DIR[t])));
    const agentsPresent = writeAgents && existsSync(join(root, "AGENTS.md"));
    if (targets.length === 0 && !agentsPresent) {
      console.error(`✕ no liebstoeckel skill installed in ${root}, run: liebstoeckel skill install`);
      process.exit(1);
    }
  } else {
    const tArg = targetArg ?? "all";
    targets =
      !tArg || tArg === "all" ? ALL_TARGETS : (tArg.split(",").filter((t): t is Target => (ALL_TARGETS as string[]).includes(t)));
    if (targets.length === 0) {
      console.error(`unknown --target "${tArg}", use one or more of: ${ALL_TARGETS.join(", ")}, or all`);
      process.exit(1);
    }
  }

  const version = await cliVersion();
  const written: string[] = [];
  try {
    // de-dupe destination dirs (some agents share a path)
    const seen = new Set<string>();
    for (const t of targets) {
      const destRoot = join(root, SKILL_DIR[t]);
      if (!seen.has(destRoot)) {
        await writeSkill(destRoot, version);
        seen.add(destRoot);
        written.push(SKILL_DIR[t] + "/");
      }
      if (t === "cursor") {
        await writeCursorRule(root);
        written.push(join(".cursor", "rules", "liebstoeckel.mdc"));
      }
    }
    if (writeAgents) {
      await writeAgentsBlock(root);
      written.push("AGENTS.md");
    }

    const where = scope === "user" ? `your user account (${root})` : root;
    console.log(`\n✓ ${sub === "update" ? "updated" : "installed"} the liebstoeckel-deck skill (v${version}) → ${where}\n`);
    for (const w of written) console.log(`   ${w}`);
    console.log(`\n   scope: ${scope} · targets: ${targets.join(", ")}\n`);
  } catch (e) {
    console.error(`✕ ${(e as Error).message}`);
    process.exit(1);
  }
}

/** Resolve scope (prompting on a TTY when ambiguous) then run the install/update.
 *  `dir` is the explicit `--dir` value (undefined = none given). */
async function runSkill(
  sub: "install" | "update",
  args: { dir?: string; scope?: string; global?: boolean; target?: string },
): Promise<void> {
  const interactive = !!process.stdin.isTTY && !!process.stdout.isTTY;
  const decision = resolveScope({
    scopeArg: args.scope,
    global: args.global,
    dirGiven: args.dir !== undefined,
    interactive,
    cwdIsDeck: isDeckDir(args.dir ?? "."),
  });

  let scope: Scope;
  if ("error" in decision) {
    console.error(`✕ ${decision.error}`);
    process.exit(1);
  } else if ("prompt" in decision) {
    // TTY-only (resolveScope returns `prompt` only when interactive). Bun's prompt
    // reads a line; default = project (the contained, safe choice).
    const ans = (prompt("Install the liebstoeckel-deck skill for [P]roject (./) or [u]ser account (~)?", "p") ?? "p")
      .trim()
      .toLowerCase();
    scope = ans.startsWith("u") ? "user" : "project";
  } else {
    scope = decision.scope;
  }

  const root = scope === "user" ? homedir() : resolve(args.dir ?? ".");
  await applySkill(sub, root, scope, args.target);
}

const scopeArgs = {
  scope: {
    type: "string",
    description: "install location: project (a deck) or user (your account ~, every project)",
    valueHint: "project|user",
  },
  global: { type: "boolean", description: "shorthand for --scope user (install for your account, ~)" },
} as const;

const skillInstallCommand = defineCommand({
  meta: { name: "install", description: "install the agent skill into a deck (--scope project) or your account (--scope user)" },
  args: {
    target: {
      type: "string",
      default: "all",
      description: "agents to target: claude, codex, cursor, gemini, all (comma-separated)",
      valueHint: "claude|codex|cursor|gemini|all",
    },
    dir: { type: "string", description: "target deck directory (project scope; default: cwd)", valueHint: "deck" },
    ...scopeArgs,
  },
  run: ({ args }) => runSkill("install", args),
});

const skillUpdateCommand = defineCommand({
  meta: { name: "update", description: "refresh the installed agent skill to the running CLI version" },
  args: {
    dir: { type: "string", description: "target deck directory (project scope; default: cwd)", valueHint: "deck" },
    ...scopeArgs,
  },
  run: ({ args }) => runSkill("update", args),
});

/** `liebstoeckel skill install|update`, manage the bundled deck-authoring Skill. */
export const skillCommand = defineCommand({
  meta: { name: "skill", description: "install/refresh the agent skill for deck authoring" },
  subCommands: { install: skillInstallCommand, update: skillUpdateCommand },
});
