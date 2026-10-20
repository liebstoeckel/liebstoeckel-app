// Which Bun binary the CLI runs on, and what to say when it is not there.
//
// Plain JavaScript on purpose: this file runs under Node (an `npm i -g` install
// on a machine without Bun) and under any Bun (`bunx`), before anything of the
// CLI is loaded. The CLI never runs on whatever `bun` is on PATH. It runs on the
// Bun binary Oven publishes to npm as `@oven/bun-<platform>`, pinned to one exact
// version in this package's optionalDependencies, so every machine runs the same
// Bun the backend runs.
//
// Everything here is pure (the probes are passed in), so it is unit-tested
// without touching the machine it runs on. The binary is only ever looked up
// from this package's own location (Node's module resolution from this file),
// never through PATH, the working directory or an environment variable: a
// deck's node_modules must not be able to hand a global CLI another binary.

/** The packages listed as optional dependencies, by `<os>-<arch>`. Oven's
 *  packages declare only `os` and `cpu`, no `libc`, so a package manager installs
 *  every listed package that matches the machine. Listing the musl and baseline
 *  builds as well would put two to four Bun binaries on every Linux x64 machine;
 *  those builds are found when installed next to the CLI instead. */
export const PRIMARY = {
  "linux-x64": "@oven/bun-linux-x64",
  "linux-arm64": "@oven/bun-linux-aarch64",
  "darwin-x64": "@oven/bun-darwin-x64",
  "darwin-arm64": "@oven/bun-darwin-aarch64",
  "win32-x64": "@oven/bun-windows-x64",
  "win32-arm64": "@oven/bun-windows-aarch64",
};

/**
 * The packages to try for this machine, in order. A variant build (baseline for
 * CPUs without AVX2, musl for Alpine and similar) is only there when someone
 * installed it on purpose, so an installed variant wins over the default one.
 * On musl the default (glibc) build cannot start at all, so only musl builds
 * are candidates there.
 * @param {{ platform: string, arch: string, musl: boolean }} m
 * @returns {{ candidates: string[], needs: string | null }}
 *   `needs` names the variant build this machine needs when the default one
 *   cannot run here (null when the default one fits).
 */
export function bunCandidates(m) {
  if (m.arch !== "x64" && m.arch !== "arm64") return { candidates: [], needs: null };
  const arch = m.arch === "arm64" ? "aarch64" : "x64";
  const primary = PRIMARY[`${m.platform}-${m.arch}`];
  if (m.platform === "linux" && m.musl) {
    const musl = `@oven/bun-linux-${arch}-musl`;
    return { candidates: m.arch === "x64" ? [musl, `${musl}-baseline`] : [musl], needs: musl };
  }
  if (primary) {
    const baseline = m.arch === "x64" ? [`${primary}-baseline`] : [];
    return { candidates: [...baseline, primary], needs: null };
  }
  if (m.platform === "android" || m.platform === "freebsd") {
    const pkg = m.platform === "android" ? `@oven/bun-linux-${arch}-android` : `@oven/bun-freebsd-${arch}`;
    return { candidates: [pkg], needs: pkg };
  }
  return { candidates: [], needs: null };
}

/** The binary inside an `@oven/bun-*` package. */
export function binaryIn(pkgDir, platform) {
  return `${pkgDir}/bin/${platform === "win32" ? "bun.exe" : "bun"}`;
}

/** The pinned version: the one exact version every `@oven/bun-*` optional
 *  dependency names. Null when they disagree or none is listed (a broken
 *  package.json, which the pin test in the repository rules out). */
export function pinnedVersion(pkgJson) {
  const versions = new Set(
    Object.entries(pkgJson.optionalDependencies ?? {})
      .filter(([name]) => name.startsWith("@oven/bun-"))
      .map(([, v]) => v),
  );
  if (versions.size !== 1) return null;
  const [v] = versions;
  return /^\d+\.\d+\.\d+$/.test(v) ? v : null;
}

/** How this CLI was most likely installed, judged by where it sits. Only used
 *  to word the fix in a message. */
export function installKind(cliDir, env = {}) {
  const p = cliDir.replace(/\\/g, "/");
  if (/\/\.bun\/install\/global\/node_modules\//.test(p) || (env.BUN_INSTALL && p.startsWith(`${env.BUN_INSTALL.replace(/\\/g, "/")}/install/global/`))) return "bun-global";
  if (/\/\.bun\/install\/cache\/|\/bunx-\d+-/.test(p)) return "bunx";
  if (/\/_npx\//.test(p)) return "npx";
  if (/\/lib\/node_modules\/@liebstoeckel\/cli$/.test(p) || /\/npm\/node_modules\/@liebstoeckel\/cli$/.test(p)) return "npm-global";
  return "local";
}

/** The reinstall command that brings a missing package back, per install kind. */
function fixCommand(kind, extraPkg, version) {
  const extra = extraPkg ? ` ${extraPkg}@${version}` : "";
  switch (kind) {
    case "bun-global":
      return `bun add -g @liebstoeckel/cli${extra}`;
    case "npm-global":
      return `npm install -g @liebstoeckel/cli${extra}`;
    case "bunx":
    case "npx":
      return extraPkg
        ? `npm install -g @liebstoeckel/cli${extra}   (a one-off npx/bunx run cannot add it)`
        : "clear the npx/bunx cache and run it again, or install it: npm install -g @liebstoeckel/cli";
    default:
      return extraPkg
        ? `npm install --save-dev ${extraPkg}@${version}   (or: bun add -d ${extraPkg}@${version})`
        : "npm install   (or: bun install), with optional dependencies included";
  }
}

/**
 * What is wrong when no usable Bun binary is there: one problem with a code
 * (for `--json`), a one-line error, the details and the exact fix.
 * @param {{ platform: string, arch: string, musl: boolean, version: string | null,
 *           tried: string[], needs: string | null, kind: string,
 *           found?: { pkg: string, version: string } | null, empty?: string | null }} m
 * @returns {{ code: string, error: string, details: string[], fix: string }}
 */
export function bunProblem(m) {
  const error = "the Bun runtime this CLI runs on is not installed";
  if (!m.version) {
    return { code: "bun_pin_broken", error, details: ["@liebstoeckel/cli's package.json names no single @oven/bun-* version"], fix: "reinstall @liebstoeckel/cli" };
  }
  if (m.tried.length === 0) {
    return {
      code: "bun_unsupported_platform",
      error: `Bun ${m.version} has no build for ${m.platform} ${m.arch}, so liebstoeckel cannot run here`,
      details: ["supported: Linux, macOS and Windows on x64 and arm64"],
      fix: "run liebstoeckel on a supported machine",
    };
  }
  if (m.empty) {
    return {
      code: "bun_binary_missing",
      error,
      details: [`the package is installed, but its binary ${m.empty} is missing`],
      fix: `${fixCommand(m.kind, null, m.version)}; if that does not bring it back, delete node_modules and install again`,
    };
  }
  if (m.found) {
    const variant = !Object.values(PRIMARY).includes(m.found.pkg);
    return {
      code: "bun_version_mismatch",
      error,
      details: [`found ${m.found.pkg}@${m.found.version}, but this CLI is pinned to Bun ${m.version}`],
      fix: fixCommand(m.kind, variant ? m.found.pkg : null, m.version),
    };
  }
  if (m.needs) {
    const why = m.musl ? "musl-based Linux (Alpine and similar)" : m.platform === "android" ? "Android" : "FreeBSD";
    return {
      code: "bun_variant_missing",
      error,
      details: [
        `looked for ${m.tried.map((t) => `${t}@${m.version}`).join(" or ")}`,
        `this machine runs ${why}, which needs its own Bun build; it is not installed by default`,
      ],
      fix: fixCommand(m.kind, m.needs, m.version),
    };
  }
  const wanted = m.tried[m.tried.length - 1];
  return {
    code: "bun_missing",
    error,
    details: [
      `looked for ${wanted}@${m.version}, an optional dependency of @liebstoeckel/cli`,
      "the install most likely skipped optional dependencies (--omit=optional, --no-optional,",
      "or a registry mirror that does not carry the @oven/* packages)",
    ],
    fix: fixCommand(m.kind, null, m.version),
  };
}

/** What a binary that is there but would not start reports. */
export function spawnProblem(bin, err) {
  const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
  const detail = err instanceof Error ? err.message : String(err);
  return {
    code: "bun_start_failed",
    error: `could not start the Bun runtime this CLI runs on${code ? ` (${code})` : ""}`,
    details: [`binary: ${bin}`, `error: ${detail}`],
    fix: "check that the file is executable and that no antivirus or allowlisting policy blocks it; reinstall @liebstoeckel/cli if it is damaged",
  };
}

/** The prose form, for stderr. */
export function problemText(p) {
  return `liebstoeckel: ${p.error}.\n${p.details.map((d) => `  ${d}\n`).join("")}  fix: ${p.fix}\n`;
}

/** The JSON form, the same shape every CLI command fails with under --json. */
export function problemJson(p) {
  return JSON.stringify({ ok: false, error: p.error, code: p.code, hint: p.fix, details: p.details });
}

/** Does this invocation ask for a JSON answer? Only an explicit `--json`: the
 *  shim cannot know which command would have defaulted to JSON when piped, and
 *  the prose on stderr is printed either way. */
export function wantsJson(argv) {
  return argv.includes("--json") && !argv.includes("--no-json");
}
