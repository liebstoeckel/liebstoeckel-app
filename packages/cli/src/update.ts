// Update reminders (npm-notifier pattern): every human-facing run prints from a
// CACHED registry check and refreshes that cache in a detached background child,
// so no command ever waits on the network. The check shells out to
// `bun pm view`, so registry resolution (scoped .npmrc / bunfig) matches
// installs exactly, Verdaccio today, public npm later, with zero config here.
// The same module also self-heals a deck's installed agent skill (version-pinned
// by `skill install`): the installed copy is a pure function of the CLI version,
// so a stale one is rewritten in place instead of nagging about it.
//
// Reminders are stderr-only and OFF for agents/CI/pipes (`remindersEnabled`),
// so the machine-readable contract ((internal ADR)) stays clean. The skill self-heal
// deliberately runs in ALL modes: agents are exactly who can't read reminders,
// and its one-line notice goes to stderr, never a --json stdout.
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bunBin } from "./bun";
import { cliVersion, SKILL_DIR } from "./skill";

export const PKG = "@liebstoeckel/cli";
// Resolve the cache path lazily, honouring $HOME (homedir() is the Windows fallback);
// it lives next to the CLI's config (mirrors creds' CONFIG_DIR).
const stateFile = () => join(process.env.HOME || homedir(), ".config", "liebstoeckel", "update-check.json");
const DEFAULT_CHECK_MS = 60 * 60 * 1000;

/** Background-check interval: 1h by default, overridable in seconds via
 *  LIEBSTOECKEL_UPDATE_CHECK_INTERVAL (garbage or non-positive values fall back). */
export function checkIntervalMs(env: Record<string, string | undefined> = process.env): number {
  const s = Number(env.LIEBSTOECKEL_UPDATE_CHECK_INTERVAL);
  return Number.isFinite(s) && s > 0 ? s * 1000 : DEFAULT_CHECK_MS;
}

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
export function shouldRefresh(state: CheckState | null, now: number, intervalMs: number = checkIntervalMs()): boolean {
  return !state || now - state.checkedAt > intervalMs || now < state.checkedAt;
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
    console.error(`↑ ${PKG} ${state.latest} is available (you run ${current}), update: liebstoeckel update`);
  }
  if (shouldRefresh(state, Date.now())) {
    // Detached child re-runs THIS file (import.meta.main → refresh()). It inherits
    // the cwd, so `bun pm view` sees the same .npmrc/bunfig the user's installs use.
    const child = Bun.spawn([bunBin, fileURLToPath(import.meta.url)], {
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

/** The latest cached registry answer, for surfaces that must stay network-free
 *  (`doctor`). Null when there is no cache or the last check failed. */
export async function cachedLatestVersion(): Promise<string | null> {
  return (await readState())?.latest ?? null;
}

/** Self-heal a stale installed skill instead of nagging about it: the installed
 *  copy is a pure function of the CLI version (stamped by `skill install`), so
 *  rewriting it in place cannot express an opinion the user needs to approve.
 *  Probes the deck AND the home dir (a `--scope user` install under e.g.
 *  `~/.claude/skills/` would otherwise age silently forever). Runs in all
 *  modes, agents/pipes included; one stderr line per healed root. */
export async function healSkills(deckDir: string): Promise<void> {
  const current = await cliVersion();
  const home = process.env.HOME || homedir();
  for (const root of new Set([resolve(deckDir), home])) {
    const installed = await installedSkillVersion(root);
    if (!installed || !isNewer(current, installed)) continue;
    const { refreshInstalledSkill } = await import("./skill");
    // A home-root heal never touches AGENTS.md (that is a project convention).
    const written = await refreshInstalledSkill(root, { agents: root !== home });
    if (written.length > 0) console.error(`↻ refreshed the agent skill v${installed} → v${current} in ${root}`);
  }
}

/** Bun's global-install root: `bun add -g` lands packages under
 *  `$BUN_INSTALL/install/global/node_modules`. */
export function bunGlobalDir(env: Record<string, string | undefined> = process.env): string {
  return join(env.BUN_INSTALL || join(env.HOME || homedir(), ".bun"), "install", "global");
}

/** Ask the registry for the latest published version, live. Blocks up to the
 *  timeout, so callers are the detached background child and the explicit
 *  `update` command (where the user asked and waiting is correct). */
export function fetchLatestVersion(): string | null {
  // `bun pm view` refuses to run outside a project, which is exactly where a
  // global-only user invokes `update`; the global install dir always has a
  // package.json, and user-level (~/.npmrc) registry config still applies there.
  for (const cwd of [undefined, bunGlobalDir()]) {
    if (cwd && !existsSync(join(cwd, "package.json"))) continue;
    try {
      // --no-cache: bun's manifest cache serves a stale dist-tag for minutes after
      // a publish; a check that exists to detect new versions must not read it.
      const proc = Bun.spawnSync([bunBin, "pm", "view", "--no-cache", PKG, "dist-tags.latest"], {
        cwd,
        stdout: "pipe",
        stderr: "ignore",
        timeout: 15_000,
      });
      const out = proc.stdout.toString().trim();
      if (proc.success && parseVersion(out)) return out;
    } catch {
      // offline / no project / no registry: try the next cwd
    }
  }
  return null;
}

/** Persist a check result. A failed check stores `latest: null` so an offline
 *  machine retries at most once per interval instead of on every command. */
export async function writeCheckState(latest: string | null): Promise<void> {
  mkdirSync(dirname(stateFile()), { recursive: true });
  await Bun.write(stateFile(), JSON.stringify({ checkedAt: Date.now(), latest } satisfies CheckState));
}

/** Background half: ask the registry for the latest version and cache the answer. */
async function refresh(): Promise<void> {
  // Survive the parent's terminal session ending mid-check (best-effort; a
  // missed refresh self-heals: the cache stays stale, so the next run retries).
  process.on("SIGHUP", () => {});
  await writeCheckState(fetchLatestVersion());
}

if (import.meta.main) void refresh();
