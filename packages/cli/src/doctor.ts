import { defineCommand } from "citty";
import { resolveChromium, systemChromiumCandidates, playwrightCoreVersion } from "@liebstoeckel/thumbnails";
import { bunBin, bunVersionError, requiredBunRange } from "./bun";
import { loadConfig, saveConfig, CONFIG_FILE } from "./config";
import { cliVersion } from "./skill";
import { cachedLatestVersion, isNewer } from "./update";
import { neededMigrations, type MigrationStatus } from "./migrations";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

/** Resolve a Chrome/Chromium path through the same order builds use, or null. */
function findChromium(): string | null {
  try {
    return resolveChromium();
  } catch {
    return null;
  }
}

export interface DoctorReport {
  bun: { version: string; required: string; ok: boolean };
  chromium: { path: string | null; ok: boolean };
  /** CLI staleness from the CACHED registry check (never a live lookup here,
   *  doctor stays network-free): `latestKnown` is null with no or a failed
   *  cache. Agents gate on `updateAvailable` and suggest `liebstoeckel update`. */
  cli: { version: string; latestKnown: string | null; updateAvailable: boolean };
  configFile: string;
}

/** Pure: assemble the environment report from the raw probes (unit-tested). */
export function buildReport(parts: {
  bunVersion: string;
  bunRange: string;
  chromium: string | null;
  cliVersion: string;
  latestKnown: string | null;
}): DoctorReport {
  return {
    bun: {
      version: parts.bunVersion,
      required: parts.bunRange,
      ok: bunVersionError(parts.bunVersion, parts.bunRange, bunBin) === null,
    },
    chromium: { path: parts.chromium, ok: parts.chromium !== null },
    cli: {
      version: parts.cliVersion,
      latestKnown: parts.latestKnown,
      updateAvailable: isNewer(parts.latestKnown, parts.cliVersion),
    },
    configFile: CONFIG_FILE,
  };
}

/** Exit code for the diagnostic path (unit-tested). Non-zero only when a hard
 *  requirement is unmet: Bun is hard, Chromium is optional (`build` skips
 *  thumbnails without it), so a missing browser reports but does not fail. */
export function diagnosticExitCode(report: DoctorReport): number {
  return report.bun.ok ? 0 : 1;
}

/** The shell-out that installs Playwright's Chromium. Pinned two ways: the Bun
 *  interpreter is `bunBin` (the one running this CLI), and `playwright@<version>`
 *  matches the `playwright-core` the capturer resolves browsers through. An
 *  unpinned `playwright install` would fetch registry-latest and drop a revision
 *  `chromium.executablePath()` can't find (a "successful" install that still fails). */
export function installChromiumArgs(): string[] {
  return [bunBin, "x", `playwright@${playwrightCoreVersion}`, "install", "chromium"];
}

/** Install Playwright's Chromium (the capturer launches via playwright-core).
 *  Streams progress; returns success. */
async function installChromium(): Promise<boolean> {
  const proc = Bun.spawn(installChromiumArgs(), {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  return (await proc.exited) === 0;
}

export const doctorCommand = defineCommand({
  meta: { name: "doctor", description: "check the build environment (Bun, Chromium) and optionally install Chromium" },
  args: {
    "install-chromium": {
      type: "boolean",
      description: "download Playwright's Chromium and record it for future builds",
    },
    json: { type: "boolean", description: "machine-readable JSON output (default when piped)" },
    dir: { type: "string", description: "deck directory to check for scaffold migrations (default: cwd)" },
  },
  async run({ args }) {
    const json = !!args.json || !process.stdout.isTTY;

    if (args["install-chromium"]) {
      // Skip if a usable browser is already resolvable, so a re-run is a no-op.
      let path = findChromium();
      if (!path) {
        if (!json) console.error("Installing Chromium via Playwright…");
        const ok = await installChromium();
        if (!ok) {
          const msg = "Chromium install failed (try `bunx playwright install chromium` and check the output).";
          if (json) console.log(JSON.stringify({ ok: false, error: msg }));
          else console.error(msg);
          process.exit(1);
        }
        path = findChromium();
      }
      if (path) await saveConfig({ chromium: path });
      if (json) console.log(JSON.stringify({ ok: !!path, chromium: path, configFile: CONFIG_FILE }));
      else console.error(path ? `✓ Chromium ready: ${path}\n  recorded in ${CONFIG_FILE}` : "Chromium still not found after install.");
      process.exit(path ? 0 : 1);
    }

    const report = buildReport({
      bunVersion: Bun.version,
      bunRange: await requiredBunRange(),
      chromium: findChromium(),
      cliVersion: await cliVersion(),
      latestKnown: await cachedLatestVersion(),
    });
    const stored = (await loadConfig()).chromium;

    // Scaffold migrations for the targeted deck (cwd or --dir, ADR-0050-style).
    // Read-only here: doctor diagnoses, `liebstoeckel dev` is what auto-patches.
    const deckDir = resolve(args.dir ?? ".");
    const inDeck = existsSync(join(deckDir, "index.html"));
    const { migrations, warnings: migrationWarnings } = inDeck
      ? neededMigrations(deckDir)
      : { migrations: [] as MigrationStatus[], warnings: [] as string[] };

    // On a miss, show where we actually looked: turns "not found" from a dead
    // end into something a user (or agent) can act on.
    const probed = report.chromium.ok ? undefined : systemChromiumCandidates();

    if (json) {
      console.log(JSON.stringify({ ...report, migrations, migrationWarnings, storedChromium: stored ?? null, ...(probed ? { probedCandidates: probed } : {}) }));
    } else {
      const ok = (b: boolean) => (b ? "✓" : "✗");
      console.error(`${ok(report.bun.ok)} Bun ${report.bun.version} (needs ${report.bun.required})`);
      console.error(
        report.chromium.ok
          ? `${ok(true)} Chromium ${report.chromium.path}`
          : `${ok(false)} Chromium not found, run \`liebstoeckel doctor --install-chromium\` or set LIEBSTOECKEL_CHROMIUM\n` +
              `    (only \`export\`/\`thumbs\` require it; \`build\` skips thumbnails without it)`,
      );
      if (probed) {
        console.error(`    looked in:`);
        for (const p of probed) console.error(`      ${p}`);
      }
      console.error(
        report.cli.updateAvailable
          ? `↑ CLI ${report.cli.version} (${report.cli.latestKnown} is available, run \`liebstoeckel update\`)`
          : `${ok(true)} CLI ${report.cli.version}${report.cli.latestKnown ? " (latest known)" : ""}`,
      );
      for (const w of migrationWarnings) console.error(`⚠ ${w}`);
      for (const m of migrations) {
        if (!m.needed) continue;
        const how = m.autoPatchable
          ? "`liebstoeckel dev` applies it automatically"
          : `apply it per the skill guide ${m.reference}`;
        console.error(`↻ migration needed (${m.id}): ${m.reason}; ${how}, or opt out via package.json liebstoeckel.migrationOptOut`);
      }
      console.error(`  config: ${CONFIG_FILE}`);
    }

    // Exit non-zero so an agent/CI can gate on the check (the umbrella's preflight
    // already enforces Bun before any command, so this is belt-and-suspenders for
    // direct/programmatic use).
    const code = diagnosticExitCode(report);
    if (code) process.exit(code);
  },
});
