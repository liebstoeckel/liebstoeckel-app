// Update reminders (npm-notifier pattern): every human-facing run prints from a
// CACHED registry check and refreshes that cache in a detached background child,
// so no command ever waits on the network. The check shells out to
// `bun pm view`, so registry resolution (scoped .npmrc / bunfig) matches
// installs exactly, Verdaccio today, public npm later, with zero config here.
// The same module also compares a deck's installed agent skill (version-pinned
// by `skill install`) against the running CLI and points at `skill update`.
//
// Reminders are stderr-only and OFF for agents/CI/pipes (`remindersEnabled`),
// so the machine-readable contract ((internal ADR)) stays clean.
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cliVersion, SKILL_DIR } from "./skill";

const PKG = "@liebstoeckel/cli";
// Resolve the cache path lazily, honouring $HOME (homedir() is the Windows fallback);
// it lives next to the CLI's config (mirrors creds' CONFIG_DIR).
const stateFile = () => join(process.env.HOME || homedir(), ".config", "liebstoeckel", "update-check.json");
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

export interface CheckState {
  checkedAt: number;
  /** Latest published version, or null when the last check failed (offline, no registry). */
  latest: string | null;
}

function parseVersion(v: string): { nums: [number, number, number]; pre: string | null } | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?/.exec(v.trim());
  if (!m) return null;
  return { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ?? null };
}

/** Semver-ish compare: numeric triple, then "a prerelease sorts before its release". */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0; // unparseable: never claim an update
  for (let i = 0; i < 3; i++) {
    if (pa.nums[i]! !== pb.nums[i]!) return pa.nums[i]! - pb.nums[i]!;
  }
  if (pa.pre === pb.pre) return 0;
  if (pa.pre === null) return 1;
  if (pb.pre === null) return -1;
  return pa.pre < pb.pre ? -1 : 1;
}

export const isNewer = (candidate: string | null | undefined, current: string): boolean =>
  !!candidate && compareVersions(candidate, current) > 0;

/** Refresh when there is no cache, it expired, or the clock went backwards. */
export function shouldRefresh(state: CheckState | null, now: number): boolean {
  return !state || now - state.checkedAt > CHECK_EVERY_MS || now < state.checkedAt;
}

/** Reminders print only on an interactive terminal: never for `--json`, pipes
 *  (agents), CI, or when explicitly disabled. */
export function remindersEnabled(
  argv: string[],
  env: Record<string, string | undefined> = process.env,
  stderrTty: boolean | undefined = process.stderr.isTTY,
): boolean {
  if (env.LIEBSTOECKEL_NO_UPDATE_CHECK) return false;
  if (env.CI) return false;
  if (argv.includes("--json")) return false;
  return !!stderrTty;
}

async function readState(): Promise<CheckState | null> {
  try {
    const s = (await Bun.file(stateFile()).json()) as CheckState;
    return typeof s?.checkedAt === "number" ? s : null;
  } catch {
    return null;
  }
}

/** Print "update available" from the cache; kick a detached refresh when stale. */
export async function updateReminder(argv: string[]): Promise<void> {
  if (!remindersEnabled(argv)) return;
  const state = await readState();
  const current = await cliVersion();
  if (state && isNewer(state.latest, current)) {
    console.error(`↑ ${PKG} ${state.latest} is available (you run ${current}), update: bun update --latest ${PKG}`);
  }
  if (shouldRefresh(state, Date.now())) {
    // Detached child re-runs THIS file (import.meta.main → refresh()). It inherits
    // the cwd, so `bun pm view` sees the same .npmrc/bunfig the user's installs use.
    const child = Bun.spawn([process.execPath, fileURLToPath(import.meta.url)], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });
    child.unref();
  }
}

/** The `version:` stamped into an installed SKILL.md by `skill install`. */
export function parseSkillVersion(skillMd: string): string | null {
  return /\n\s*version:\s*(\S+)/.exec(skillMd)?.[1] ?? null;
}

export async function installedSkillVersion(deckDir: string): Promise<string | null> {
  for (const rel of Object.values(SKILL_DIR)) {
    const p = join(deckDir, rel, "SKILL.md");
    if (!existsSync(p)) continue;
    const v = parseSkillVersion(await Bun.file(p).text());
    if (v) return v;
  }
  return null;
}

/** Warn when the deck's installed agent skill is older than the running CLI. */
export async function skillReminder(deckDir: string, argv: string[]): Promise<void> {
  if (!remindersEnabled(argv)) return;
  const installed = await installedSkillVersion(deckDir);
  if (!installed) return;
  const current = await cliVersion();
  if (isNewer(current, installed)) {
    console.error(`↑ this deck's agent skill is v${installed}, the CLI is v${current}, refresh: liebstoeckel skill update`);
  }
}

/** Background half: ask the registry for the latest version and cache the answer.
 *  A failed check caches `latest: null` so an offline machine retries at most
 *  once per interval instead of on every command. */
async function refresh(): Promise<void> {
  // Survive the parent's terminal session ending mid-check (best-effort; a
  // missed refresh self-heals: the cache stays stale, so the next run retries).
  process.on("SIGHUP", () => {});
  let latest: string | null = null;
  try {
    const proc = Bun.spawnSync([process.execPath, "pm", "view", PKG, "dist-tags.latest"], {
      stdout: "pipe",
      stderr: "ignore",
      timeout: 15_000,
    });
    const out = proc.stdout.toString().trim();
    if (proc.success && parseVersion(out)) latest = out;
  } catch {
    // offline / no project / no registry: cache the miss
  }
  mkdirSync(dirname(stateFile()), { recursive: true });
  await Bun.write(stateFile(), JSON.stringify({ checkedAt: Date.now(), latest } satisfies CheckState));
}

if (import.meta.main) void refresh();
