// Build-time trust gate. A liebstoeckel deck is *code*: building it runs the deck's
// build-time modules (Bun macros such as the animated-code macro, build plugins) in this
// process with full filesystem and network access. Building a deck you did not write —
// cloned, downloaded, scaffolded by an agent — is therefore arbitrary code execution on
// your machine. This gate requires an explicit one-time confirmation before the first
// build of an unfamiliar deck.
//
// The trust ledger lives in the user config dir (NOT inside the deck), keyed by absolute
// path, so a shared/cloned deck can never ship a forged "trusted" marker of its own. A
// deck scaffolded here via `liebstoeckel new` is recorded as trusted automatically, so an
// author is never prompted for decks they created on this machine.
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { CONFIG_DIR } from "./creds";

/** Ledger path. `LIEBSTOECKEL_TRUST_FILE` overrides it (a test seam; resolved per call
 *  so tests can point at a temp file without touching the real user config). */
function trustFile(): string {
  return process.env.LIEBSTOECKEL_TRUST_FILE || join(CONFIG_DIR, "trusted-decks.json");
}

interface TrustLedger {
  paths: string[];
}

async function readLedger(): Promise<TrustLedger> {
  try {
    const j = JSON.parse(await Bun.file(trustFile()).text()) as Partial<TrustLedger>;
    return { paths: Array.isArray(j.paths) ? j.paths : [] };
  } catch {
    return { paths: [] };
  }
}

/** Record `dir` as a deck the author trusts to execute its build-time code here. */
export async function trustDeck(dir: string): Promise<void> {
  const abs = resolve(dir);
  const led = await readLedger();
  if (led.paths.includes(abs)) return;
  led.paths.push(abs);
  const file = trustFile();
  await mkdir(dirname(file), { recursive: true });
  await Bun.write(file, JSON.stringify(led, null, 2));
}

/** Has `dir` been trusted before (or scaffolded here)? */
export async function isDeckTrusted(dir: string): Promise<boolean> {
  return (await readLedger()).paths.includes(resolve(dir));
}

export interface TrustGateOptions {
  /** Pre-approved out of band (`--trust` flag or `LIEBSTOECKEL_TRUST_BUILD=1`). */
  preapproved?: boolean;
  /** Interactive confirm; returns true to trust. Injected so the gate stays testable.
   *  Omit (e.g. non-TTY) to refuse rather than prompt. */
  confirm?: (dir: string) => boolean;
}

/** Decide whether a build of `dir` may proceed, remembering a yes. Returns true to build,
 *  false to abort. Trusted-or-scaffolded decks pass silently; an unfamiliar deck needs
 *  `preapproved` or a `confirm` that returns true. */
export async function ensureBuildTrust(dir: string, opts: TrustGateOptions): Promise<boolean> {
  if (await isDeckTrusted(dir)) return true;
  if (opts.preapproved) {
    await trustDeck(dir);
    return true;
  }
  if (opts.confirm && opts.confirm(resolve(dir))) {
    await trustDeck(dir);
    return true;
  }
  return false;
}
