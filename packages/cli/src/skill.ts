import { fileURLToPath } from "node:url";
import { existsSync, readdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * `liebstoeckel skill install` — materialize the bundled `liebstoeckel-deck` Skill
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

// Where each agent looks for a skill folder, relative to the deck root.
export const SKILL_DIR: Record<Target, string> = {
  claude: join(".claude", "skills", SKILL_NAME),
  codex: join(".agents", "skills", SKILL_NAME), // also read by Gemini's shared path
  cursor: join(".cursor", "skills", SKILL_NAME),
  gemini: join(".gemini", "skills", SKILL_NAME),
};

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
 *  if present (idempotent), else append it. Pure — the unit-test anchor. */
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

export async function runSkill(argv: string[]): Promise<void> {
  const positionals = argv.filter((a) => !a.startsWith("-"));
  const sub = positionals[0];
  if (sub !== "install" && sub !== "update") {
    console.error("usage: liebstoeckel skill install|update [--target claude|codex|cursor|gemini|all] [--dir <deck>]");
    process.exit(1);
  }

  const dirIdx = argv.indexOf("--dir");
  const deckDir = dirIdx >= 0 ? argv[dirIdx + 1]! : ".";
  let targets: Target[];
  if (sub === "update") {
    // Refresh whatever is already installed (the AGENTS.md block is always
    // rewritten); installing NEW agent paths stays `install`'s job.
    targets = ALL_TARGETS.filter((t) => existsSync(join(deckDir, SKILL_DIR[t])));
    if (targets.length === 0 && !existsSync(join(deckDir, "AGENTS.md"))) {
      console.error(`✕ no liebstoeckel skill installed in ${deckDir} — run: liebstoeckel skill install`);
      process.exit(1);
    }
  } else {
    const tIdx = argv.indexOf("--target");
    const tArg = tIdx >= 0 ? argv[tIdx + 1] : "all";
    targets =
      !tArg || tArg === "all" ? ALL_TARGETS : (tArg.split(",").filter((t): t is Target => (ALL_TARGETS as string[]).includes(t)));
    if (targets.length === 0) {
      console.error(`unknown --target "${tArg}" — use one or more of: ${ALL_TARGETS.join(", ")}, or all`);
      process.exit(1);
    }
  }

  const version = await cliVersion();
  const written: string[] = [];
  try {
    // de-dupe destination dirs (some agents share a path)
    const seen = new Set<string>();
    for (const t of targets) {
      const destRoot = join(deckDir, SKILL_DIR[t]);
      if (!seen.has(destRoot)) {
        await writeSkill(destRoot, version);
        seen.add(destRoot);
        written.push(SKILL_DIR[t] + "/");
      }
      if (t === "cursor") {
        await writeCursorRule(deckDir);
        written.push(join(".cursor", "rules", "liebstoeckel.mdc"));
      }
    }
    // AGENTS.md is the universal fallback — always write it
    await writeAgentsBlock(deckDir);
    written.push("AGENTS.md");

    console.log(`\n✓ ${sub === "update" ? "updated" : "installed"} the liebstoeckel-deck skill (v${version}) → ${deckDir}\n`);
    for (const w of written) console.log(`   ${w}`);
    console.log(`\n   targets: ${targets.join(", ")}\n`);
  } catch (e) {
    console.error(`✕ ${(e as Error).message}`);
    process.exit(1);
  }
}
