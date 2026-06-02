// `liebstoeckel login` + `liebstoeckel push` + `liebstoeckel orgs` — the cloud
// path (ADR 0047/0053). login runs the OAuth 2.0 device-authorization grant
// (RFC 8628) against the control plane's /api/auth/device/* endpoints; push
// uploads a single-file deck to the versioned /api/v1/decks with the resulting
// bearer token; orgs lists/sets the active organization decks are pushed into.
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";

const CLIENT_ID = "liebstoeckel-cli";
const CONFIG_DIR = join(homedir(), ".config", "liebstoeckel");
const CONFIG_FILE = join(CONFIG_DIR, "credentials.json");

interface Creds {
  api: string;
  token: string;
  /** Default organization slug to push into (ADR 0053); omitted = personal. */
  org?: string;
}

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

/** Uniform cloud org-targeting (ADR 0057): an explicit `--org <slug>` wins, else
 *  the stored default (`creds.org`), else undefined (= the personal workspace,
 *  the server's no-`x-org-slug` default). Strips the flag so a following
 *  positional (e.g. a deck path) isn't mistaken for the org value. */
export function resolveOrg(argv: string[], defaultOrg?: string): { org?: string; rest: string[] } {
  const i = argv.indexOf("--org");
  if (i >= 0 && argv[i + 1]) {
    return { org: argv[i + 1], rest: [...argv.slice(0, i), ...argv.slice(i + 2)] };
  }
  return { org: defaultOrg, rest: argv };
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

/** The deck's title from its built HTML `<title>` (mirrors control-core). */
function titleFromHtml(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  const t = m[1]!
    .replace(/&(amp|lt|gt|quot|#39|apos);/g, (e) =>
      ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'" })[e] ?? e,
    )
    .replace(/\s+/g, " ")
    .trim();
  return t || null;
}

/** The deck name from the build path: the folder above `dist/`, else the parent
 *  folder (so `…/my-talk/dist/index.html` → "my-talk", never "index"). */
function deckNameFromPath(absFile: string): string | null {
  const parts = absFile.split(sep);
  const di = parts.lastIndexOf("dist");
  if (di > 0) return parts[di - 1] ?? null;
  return basename(dirname(absFile)) || null;
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
      // Preserve any previously chosen default org.
      const prev = await loadCreds();
      await saveCreds({ api, token: t.access_token, org: prev?.api === api ? prev.org : undefined });
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
  const creds = await loadCreds();
  const { org, rest } = resolveOrg(argv, creds?.org);
  const file = rest.find((a) => !a.startsWith("-"));
  if (!file) {
    console.error("usage: liebstoeckel push <deck.html> [--title <t>] [--org <slug>] [--api <host>]");
    process.exit(1);
  }
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
  const html = await Bun.file(path).text();
  // Title precedence (ADR 0054): --title → embedded <title> → deck folder name.
  const title =
    flag(argv, "--title") ?? titleFromHtml(html) ?? deckNameFromPath(path) ?? basename(file).replace(/\.html?$/i, "");

  const headers: Record<string, string> = {
    authorization: `Bearer ${creds.token}`,
    "content-type": "text/html",
    "x-deck-title": title,
  };
  if (org) headers["x-org-slug"] = org;

  const res = await fetch(`${api}/api/v1/decks`, { method: "POST", headers, body: html });
  if (res.status === 401) {
    console.error("✕ session expired — run `liebstoeckel login` again.");
    process.exit(1);
  }
  if (res.status === 403) {
    console.error(`✕ you're not a member of org "${org}". Run \`liebstoeckel orgs\` to see your teams.`);
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`✕ upload failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const { deck } = (await res.json()) as { deck: { id: string; title: string } };
  console.log(`\n✓ pushed "${deck.title}"${org ? ` to ${org}` : ""} — view it at ${api}\n`);
}

interface OrgList {
  active: { slug: string; name: string; role: string; personal: boolean; plan: string };
  orgs: Array<{ slug: string; name: string; personal: boolean }>;
}

async function fetchOrgs(api: string, token: string): Promise<OrgList> {
  const res = await fetch(`${api}/api/v1/orgs`, { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    console.error("✕ session expired — run `liebstoeckel login` again.");
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`✕ could not list orgs: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  return (await res.json()) as OrgList;
}

export async function runOrgs(argv: string[]): Promise<void> {
  const creds = await loadCreds();
  const api = (flag(argv, "--api") ?? creds?.api ?? "").replace(/\/+$/, "");
  if (!creds || !api) {
    console.error("✕ not logged in — run: liebstoeckel login --api <https://app-host>");
    process.exit(1);
  }

  const [sub, slug] = argv.filter((a) => !a.startsWith("-"));

  if (sub === "use") {
    if (!slug) {
      console.error("usage: liebstoeckel orgs use <slug>");
      process.exit(1);
    }
    const { orgs } = await fetchOrgs(api, creds.token);
    const match = orgs.find((o) => o.slug === slug);
    if (!match) {
      console.error(`✕ no org "${slug}" — you're a member of: ${orgs.map((o) => o.slug).join(", ")}`);
      process.exit(1);
    }
    await saveCreds({ ...creds, org: match.personal ? undefined : match.slug });
    console.log(`\n✓ pushes now go to ${match.name} (${match.slug})\n`);
    return;
  }

  // Default: list.
  const { active, orgs } = await fetchOrgs(api, creds.token);
  const def = creds.org;
  console.log("\n  your workspaces:\n");
  for (const o of orgs) {
    const marker = (def ? o.slug === def : o.personal) ? "→" : " ";
    const tags = o.personal ? "  (personal)" : "";
    console.log(`   ${marker} ${o.slug.padEnd(24)} ${o.name}${tags}`);
  }
  console.log(`\n  plan: ${active.plan}   → = default for \`push\` (change: liebstoeckel orgs use <slug>)\n`);
}

interface CloudDeck {
  id: string;
  title: string;
  shared: boolean;
  shareSlug: string | null;
  views: number;
  uniqueViews: number;
}

/** `liebstoeckel decks [--org <slug>]` — list the active org's decks + views. */
export async function runDecks(argv: string[]): Promise<void> {
  const creds = await loadCreds();
  const { org } = resolveOrg(argv, creds?.org);
  const api = (flag(argv, "--api") ?? creds?.api ?? "").replace(/\/+$/, "");
  if (!creds || !api) {
    console.error("✕ not logged in — run: liebstoeckel login --api <https://app-host>");
    process.exit(1);
  }
  const headers: Record<string, string> = { authorization: `Bearer ${creds.token}` };
  if (org) headers["x-org-slug"] = org;
  const res = await fetch(`${api}/api/v1/decks`, { headers });
  if (res.status === 401) {
    console.error("✕ session expired — run `liebstoeckel login` again.");
    process.exit(1);
  }
  if (res.status === 403) {
    console.error(`✕ you're not a member of org "${org}".`);
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`✕ could not list decks: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const { decks } = (await res.json()) as { decks: CloudDeck[] };
  if (!decks.length) {
    console.log(`\n  no decks${org ? ` in ${org}` : ""} yet — push one with: liebstoeckel push\n`);
    return;
  }
  console.log(`\n  decks${org ? ` in ${org}` : ""}:\n`);
  for (const d of decks) {
    const share = d.shared ? "shared" : "private";
    console.log(`   ${d.title.slice(0, 40).padEnd(40)}  ${String(d.views).padStart(5)} views  ${share}`);
  }
  console.log();
}
