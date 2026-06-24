import { defineCommand } from "citty";
import { resolveChromium } from "@liebstoeckel/thumbnails";
import { bunBin, bunVersionError, requiredBunRange } from "./bun";
import { loadConfig, saveConfig, CONFIG_FILE } from "./config";

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
  configFile: string;
}

/** Pure: assemble the environment report from the raw probes (unit-tested). */
export function buildReport(parts: {
  bunVersion: string;
  bunRange: string;
  chromium: string | null;
}): DoctorReport {
  return {
    bun: {
      version: parts.bunVersion,
      required: parts.bunRange,
      ok: bunVersionError(parts.bunVersion, parts.bunRange, bunBin) === null,
    },
    chromium: { path: parts.chromium, ok: parts.chromium !== null },
    configFile: CONFIG_FILE,
  };
}

/** Install Playwright's Chromium (the capturer launches via playwright-core),
 *  pinned to the running Bun. Streams progress; returns success. */
async function installChromium(): Promise<boolean> {
  const proc = Bun.spawn([bunBin, "x", "playwright", "install", "chromium"], {
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
    });
    const stored = (await loadConfig()).chromium;

    if (json) {
      console.log(JSON.stringify({ ...report, storedChromium: stored ?? null }));
      return;
    }

    const ok = (b: boolean) => (b ? "✓" : "✗");
    console.error(`${ok(report.bun.ok)} Bun ${report.bun.version} (needs ${report.bun.required})`);
    console.error(
      report.chromium.ok
        ? `${ok(true)} Chromium ${report.chromium.path}`
        : `${ok(false)} Chromium not found, run \`liebstoeckel doctor --install-chromium\` or set LIEBSTOECKEL_CHROMIUM\n` +
            `    (only \`export\`/\`thumbs\` require it; \`build\` skips thumbnails without it)`,
    );
    console.error(`  config: ${CONFIG_FILE}`);
  },
});
