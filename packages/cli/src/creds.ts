// Cloud credentials, shared by the cloud commands (login/push/orgs/brand) and the
// registry transport (`@org`). Kept in its own module so `add.ts` and `cloud.ts`
// can both read creds without an import cycle.
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_DIR = join(homedir(), ".config", "liebstoeckel");
export const CONFIG_FILE = join(CONFIG_DIR, "credentials.json");

export interface Creds {
  api: string;
  token: string;
  /** Default organization slug for push/brand/@org ((internal ADR)); omitted = personal. */
  org?: string;
}

export async function loadCreds(): Promise<Creds | null> {
  try {
    return JSON.parse(await Bun.file(CONFIG_FILE).text()) as Creds;
  } catch {
    return null;
  }
}

export async function saveCreds(c: Creds): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await Bun.write(CONFIG_FILE, JSON.stringify(c, null, 2));
  // Best-effort lock-down of the token file.
  await Bun.$`chmod 600 ${CONFIG_FILE}`.quiet().catch(() => {});
}
