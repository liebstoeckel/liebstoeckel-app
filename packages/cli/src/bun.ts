import { fileURLToPath } from "node:url";

/** The Bun binary actually running this CLI.
 *
 *  Always resolve Bun by interrogating the running process (`process.execPath`) */
export const bunBin = process.execPath;

const PKG_JSON = fileURLToPath(new URL("../package.json", import.meta.url));

/** Fallback range if package.json can't be read; kept in sync with `engines.bun`. */
const DEFAULT_RANGE = ">=1.3";

/** The Bun range the CLI declares it needs (package.json `engines.bun`). */
export async function requiredBunRange(): Promise<string> {
  try {
    const pkg = (await Bun.file(PKG_JSON).json()) as { engines?: { bun?: string } };
    return pkg.engines?.bun ?? DEFAULT_RANGE;
  } catch {
    return DEFAULT_RANGE;
  }
}

/** Drop prerelease/build metadata, judging a build by its release version.
 *  `Bun.semver.satisfies("1.5.0-canary.X", ">=1.3")` is `false`. npm-semver only
 *  lets a prerelease satisfy a range that pins the *same* major.minor.patch, so a
 *  perfectly capable canary/nightly Bun would otherwise be rejected. */
function releaseVersion(version: string): string {
  return version.split("+")[0]!.split("-")[0]!;
}

/** Pure decision core (unit-tested): the error to print if `current` doesn't
 *  satisfy `range`, else null. `binPath` is named in the message so the user can
 *  see *which* Bun is running, the one that an upgrade must actually move. */
export function bunVersionError(current: string, range: string, binPath: string): string | null {
  if (Bun.semver.satisfies(releaseVersion(current), range)) return null;
  return (
    `liebstoeckel needs Bun ${range}, but this CLI is running on Bun ${current}.\n` +
    `  binary: ${binPath}\n` +
    `  fix:    bun upgrade   (then re-run)\n`
  );
}

/** Preflight, run on every CLI invocation: confirm the Bun interpreting us (and
 *  therefore every `bunBin` shell-out) satisfies `engines.bun`. A too-old Bun
 *  otherwise fails deep inside a command with an opaque error, so fail fast here
 *  with an actionable message instead. */
export async function assertBunVersion(): Promise<void> {
  const msg = bunVersionError(Bun.version, await requiredBunRange(), bunBin);
  if (msg) {
    process.stderr.write(msg);
    process.exit(1);
  }
}
