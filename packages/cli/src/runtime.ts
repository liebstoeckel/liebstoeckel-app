// Which Bun and which esbuild this CLI runs on, and where they came from, for
// `liebstoeckel --version` and `doctor`. The `liebstoeckel` command starts the
// CLI on the Bun binary pinned in package.json (an `@oven/bun-*` package); a
// run that bypasses it (`bun src/cli.ts`, the monorepo scripts) runs on some
// other Bun, and these reports say so.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const PKG_JSON = fileURLToPath(new URL("../package.json", import.meta.url));

export interface BunRuntime {
  version: string;
  /** The binary running this process. */
  path: string;
  /** The Bun version pinned in package.json, null when none is pinned. */
  pinned: string | null;
  /** The `@oven/bun-*` package the binary belongs to, null for any other Bun. */
  package: string | null;
  /** `pinned` when this is the pinned binary, `other` for any other Bun. */
  source: "pinned" | "other";
}

export interface EsbuildRuntime {
  version: string | null;
  /** The `@esbuild/*` package holding the native binary, null when not found. */
  package: string | null;
  /** Set when ESBUILD_BINARY_PATH points esbuild at another binary. */
  binaryPath: string | null;
}

/** Pure: the `@oven/bun-*` package a binary path sits in, if any. */
export function ovenPackageOf(execPath: string): string | null {
  const m = /[\\/]node_modules[\\/]@oven[\\/](bun-[a-z0-9-]+)[\\/]bin[\\/]bun(?:\.exe)?$/i.exec(execPath);
  if (m) return `@oven/${m[1]}`;
  // The same binary after Oven's `bun` package moved it into its own bin/ (its postinstall).
  return /[\\/]node_modules[\\/]bun[\\/]bin[\\/]bun\.exe$/i.test(execPath) ? "bun" : null;
}

/** Pure: the one exact version every `@oven/bun-*` optional dependency names. */
export function pinnedBunVersion(pkg: { optionalDependencies?: Record<string, string> }): string | null {
  const versions = new Set(
    Object.entries(pkg.optionalDependencies ?? {})
      .filter(([name]) => name.startsWith("@oven/bun-"))
      .map(([, v]) => v),
  );
  if (versions.size !== 1) return null;
  const [v] = versions as Set<string>;
  return /^\d+\.\d+\.\d+$/.test(v!) ? v! : null;
}

/** Pure: assemble the Bun report from the raw probes. */
export function bunRuntimeFrom(parts: { version: string; execPath: string; pinned: string | null }): BunRuntime {
  const pkg = ovenPackageOf(parts.execPath);
  const source = pkg !== null && parts.pinned !== null && parts.version === parts.pinned ? "pinned" : "other";
  return { version: parts.version, path: parts.execPath, pinned: parts.pinned, package: pkg, source };
}

export async function bunRuntime(): Promise<BunRuntime> {
  let pinned: string | null = null;
  try {
    pinned = pinnedBunVersion(await Bun.file(PKG_JSON).json());
  } catch {
    // an unreadable package.json reports no pin
  }
  return bunRuntimeFrom({ version: Bun.version, execPath: process.execPath, pinned });
}

/** The esbuild the build core resolves, found the way esbuild finds its own
 *  binary: the `@esbuild/<os>-<arch>` package next to it. Never throws. */
export function esbuildRuntime(): EsbuildRuntime {
  const binaryPath = process.env.ESBUILD_BINARY_PATH || null;
  try {
    const build = import.meta.resolve("@liebstoeckel/build");
    const fromBuild = createRequire(build.startsWith("file:") ? fileURLToPath(build) : build);
    const esbuildPkg = fromBuild.resolve("esbuild/package.json");
    const version = (JSON.parse(readFileSync(esbuildPkg, "utf8")) as { version: string }).version;
    const name = `@esbuild/${process.platform}-${process.arch}`;
    let pkg: string | null = null;
    try {
      if (existsSync(createRequire(esbuildPkg).resolve(`${name}/package.json`))) pkg = name;
    } catch {
      pkg = null;
    }
    return { version, package: pkg, binaryPath };
  } catch {
    return { version: null, package: null, binaryPath };
  }
}

/** Pure: the lines `liebstoeckel --version` prints. */
export function versionLines(cli: string, bun: BunRuntime, esbuild: EsbuildRuntime): string[] {
  const bunFrom =
    bun.source === "pinned"
      ? `pinned, ${bun.package}`
      : `${bun.path}, not the CLI's pinned Bun${bun.pinned ? ` ${bun.pinned}` : ""}`;
  const esbuildFrom = esbuild.binaryPath
    ? `ESBUILD_BINARY_PATH=${esbuild.binaryPath}`
    : esbuild.package ?? "native binary not found";
  return [`liebstoeckel ${cli}`, `bun ${bun.version} (${bunFrom})`, `esbuild ${esbuild.version ?? "not found"} (${esbuildFrom})`];
}
