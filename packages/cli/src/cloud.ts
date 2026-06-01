// `liebstoeckel login` + `liebstoeckel push` — the cloud upload path (ADR 0047).
// login runs the OAuth 2.0 device-authorization grant (RFC 8628) against the
// control plane's /api/auth/device/* endpoints; push uploads a single-file deck
// to the versioned /api/v1/decks with the resulting bearer token.
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

const CLIENT_ID = "liebstoeckel-cli";
const CONFIG_DIR = join(homedir(), ".config", "liebstoeckel");
const CONFIG_FILE = join(CONFIG_DIR, "credentials.json");

interface Creds {
  api: string;
  token: string;
}

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function loadCreds(): Promise<Creds | null> {
  try {
    return JSON.parse(await Bun.file(CONFIG_FILE).text()) as Creds;
  } catch {
    return null;
  }
}

async function saveCreds(c: Creds): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await Bun.write(CONFIG_FILE, JSON.stringify(c, null, 2));
  // Best-effort lock-down of the token file.
  await Bun.$`chmod 600 ${CONFIG_FILE}`.quiet().catch(() => {});
}

export async function runLogin(argv: string[]): Promise<void> {
  const api = (flag(argv, "--api") ?? process.env.LIEBSTOECKEL_API ?? "").replace(/\/+$/, "");
  if (!api) {
    console.error("usage: liebstoeckel login --api <https://app-host>");
    process.exit(1);
  }

  const codeRes = await fetch(`${api}/api/auth/device/code`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, scope: "decks" }),
  });
  if (!codeRes.ok) {
    console.error(`✕ could not start login: ${codeRes.status} ${await codeRes.text()}`);
    process.exit(1);
  }
  const dc = (await codeRes.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete?: string;
    expires_in?: number;
    interval?: number;
  };

  const verify = dc.verification_uri_complete ?? dc.verification_uri;
  console.log(`\n  To sign in, open this URL in your browser:\n\n    ${verify}\n`);
  if (!dc.verification_uri_complete) console.log(`  and enter the code:  ${dc.user_code}\n`);
  console.log("  Waiting for approval…");

  const intervalMs = (dc.interval ?? 5) * 1000;
  const deadline = Date.now() + (dc.expires_in ?? 600) * 1000;
  while (Date.now() < deadline) {
    await Bun.sleep(intervalMs);
    const tRes = await fetch(`${api}/api/auth/device/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: dc.device_code,
        client_id: CLIENT_ID,
      }),
    });
    const t = (await tRes.json().catch(() => ({}))) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };
    if (tRes.ok && t.access_token) {
      await saveCreds({ api, token: t.access_token });
      console.log("\n✓ logged in. Credentials saved to ~/.config/liebstoeckel/credentials.json\n");
      return;
    }
    // RFC 8628: keep polling while pending / told to slow down.
    if (t.error && t.error !== "authorization_pending" && t.error !== "slow_down") {
      console.error(`\n✕ ${t.error}${t.error_description ? `: ${t.error_description}` : ""}`);
      process.exit(1);
    }
  }
  console.error("\n✕ login timed out — run `liebstoeckel login` again.");
  process.exit(1);
}

export async function runPush(argv: string[]): Promise<void> {
  const file = argv.find((a) => !a.startsWith("-"));
  if (!file) {
    console.error("usage: liebstoeckel push <deck.html> [--title <title>] [--api <host>]");
    process.exit(1);
  }
  const creds = await loadCreds();
  const api = (flag(argv, "--api") ?? creds?.api ?? "").replace(/\/+$/, "");
  if (!creds || !api) {
    console.error("✕ not logged in — run: liebstoeckel login --api <https://app-host>");
    process.exit(1);
  }

  const path = resolve(file);
  if (!(await Bun.file(path).exists())) {
    console.error(`✕ no such file: ${file}`);
    process.exit(1);
  }
  const title = flag(argv, "--title") ?? basename(file).replace(/\.html?$/i, "");
  const body = await Bun.file(path).arrayBuffer();

  const res = await fetch(`${api}/api/v1/decks`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${creds.token}`,
      "content-type": "text/html",
      "x-deck-title": title,
    },
    body,
  });
  if (res.status === 401) {
    console.error("✕ session expired — run `liebstoeckel login` again.");
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`✕ upload failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const { deck } = (await res.json()) as { deck: { id: string; title: string } };
  console.log(`\n✓ pushed "${deck.title}" — view it at ${api}\n`);
}
