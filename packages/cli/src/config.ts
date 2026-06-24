// Non-secret CLI preferences in the user config dir (sibling of credentials.json,
// which holds cloud tokens). Today just the resolved Chromium path, so a browser
// found or installed once via `doctor` is reused by every later build/export
// without re-detecting or re-exporting LIEBSTOECKEL_CHROMIUM.
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { CONFIG_DIR } from "./creds";

export const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export interface Config {
  /** Path to a Chrome/Chromium binary, recorded by `doctor` (detect or install). */
  chromium?: string;
}

export async function loadConfig(): Promise<Config> {
  try {
    return JSON.parse(await Bun.file(CONFIG_FILE).text()) as Config;
  } catch {
    return {};
  }
}

export async function saveConfig(patch: Config): Promise<void> {
  const next = { ...(await loadConfig()), ...patch };
  await mkdir(CONFIG_DIR, { recursive: true });
  await Bun.write(CONFIG_FILE, JSON.stringify(next, null, 2));
}

/** Hydrate `LIEBSTOECKEL_CHROMIUM` from saved config when the user hasn't set it,
 *  so a once-configured/installed browser feeds the existing resolution order
 *  (explicit env still wins). Best-effort; a stale path just falls through to the
 *  system/Playwright probes in `resolveChromium`. */
export async function hydrateChromiumEnv(): Promise<void> {
  if (process.env.LIEBSTOECKEL_CHROMIUM) return;
  const { chromium } = await loadConfig();
  if (chromium) process.env.LIEBSTOECKEL_CHROMIUM = chromium;
}
