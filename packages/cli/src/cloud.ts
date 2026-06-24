// `liebstoeckel login` + `liebstoeckel push` + `liebstoeckel orgs`, the cloud
// path ((internal ADR)/0053). login runs the OAuth 2.0 device-authorization grant
// (RFC 8628) against the control plane's /api/auth/device/* endpoints; push
// uploads a single-file deck to the versioned /api/v1/decks with the resulting
// bearer token; orgs lists/sets the active organization decks are pushed into.
import { defineCommand } from "citty";
import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { bunBin } from "./bun";
import { loadCreds, saveCreds } from "./creds";

const CLIENT_ID = "liebstoeckel-cli";

/** Shared `--api` / `--org` args for the cloud commands. */
const CLOUD_ARGS = {
  api: { type: "string" as const, description: "control-plane host (or LIEBSTOECKEL_API)", valueHint: "https://app-host" },
  org: { type: "string" as const, description: "organization slug", valueHint: "slug" },
};

/** Exit for a cloud command that has no API to talk to. The hosted control plane
 *  is not generally available yet, so OSS users see "coming soon" instead of a
 *  bare auth error that looks like a bug. */
function notLoggedIn(): never {
  // An agent (stdout not a TTY) gets the failure as JSON it can act on, per the
  // agent-readable contract ((internal ADR)); a human at a terminal gets the prose.
  if (!process.stdout.isTTY) {
    console.log(
      JSON.stringify({
        error: "not logged in",
        hint: "liebstoeckel cloud is coming soon; run `liebstoeckel login` once a control plane is available",
      }),
    );
  } else {
    console.error("✕ not logged in, run: liebstoeckel login --api <https://app-host>");
    console.error("  (liebstoeckel cloud is coming soon; this command needs a hosted control plane)");
  }
  process.exit(1);
}

/** Uniform cloud org-targeting ((internal ADR)): an explicit `--org <slug>` wins, else
 *  the stored default (`creds.org`), else undefined (= the personal workspace,
 *  the server's no-`x-org-slug` default). */
export function resolveOrg(args: { org?: string }, defaultOrg?: string): string | undefined {
  return args.org ?? defaultOrg;
}


/** Default `push` target when no path is given: the single built `.html` in
 *  `./dist` (the deck slug, e.g. `dist/poll-demo.html`), preferring `index.html`
 *  if several exist. The server derives the title from the file's own `<title>`,
 *  so the CLI no longer parses it ((internal ADR), superseding 0054's client-side parse). */
function defaultDeckHtml(): string | null {
  const dir = resolve("dist");
  if (!existsSync(dir)) return null;
  const htmls = readdirSync(dir).filter((f) => /\.html?$/i.test(f));
  if (htmls.length === 1) return join("dist", htmls[0]!);
  if (htmls.includes("index.html")) return join("dist", "index.html");
  return null;
}

/** The deck name from the build path: the folder above `dist/`, else the parent
 *  folder (so `…/my-talk/dist/index.html` → "my-talk", never "index"). */
function deckNameFromPath(absFile: string): string | null {
  const parts = absFile.split(sep);
  const di = parts.lastIndexOf("dist");
  if (di > 0) return parts[di - 1] ?? null;
  return basename(dirname(absFile)) || null;
}

/** A stable, url-safe deck key from a name ((internal ADR): re-push upserts by it). */
function slugifyKey(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "deck"
  );
}

async function runLogin(api: string): Promise<void> {
  if (!api) {
    console.error("usage: liebstoeckel login --api <https://app-host>");
    console.error("  (liebstoeckel cloud is coming soon; this command needs a hosted control plane)");
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
  console.error("\n✕ login timed out, run `liebstoeckel login` again.");
  process.exit(1);
}

export const loginCommand = defineCommand({
  meta: { name: "login", description: "sign in to liebstoeckel cloud (device flow), coming soon" },
  args: { api: CLOUD_ARGS.api },
  run: ({ args }) => runLogin((args.api ?? process.env.LIEBSTOECKEL_API ?? "").replace(/\/+$/, "")),
});

export const pushCommand = defineCommand({
  meta: { name: "push", description: "upload/update a deck to liebstoeckel cloud, coming soon" },
  args: {
    deck: { type: "positional", required: false, description: "deck .html (default: ./dist)", valueHint: "deck.html" },
    title: { type: "string", description: "override the deck title", valueHint: "t" },
    name: { type: "string", description: "deck key for re-push upsert", valueHint: "key" },
    new: { type: "boolean", description: "force a fresh deck (new key)" },
    org: CLOUD_ARGS.org,
    api: CLOUD_ARGS.api,
  },
  run: ({ args }) => runPush(args),
});

async function runPush(args: {
  deck?: string;
  title?: string;
  name?: string;
  new?: boolean;
  org?: string;
  api?: string;
}): Promise<void> {
  const creds = await loadCreds();
  const org = resolveOrg(args, creds?.org);
  // With no path, push the built deck in ./dist ((internal ADR)), matching `liebstoeckel build`.
  const file = args.deck ?? defaultDeckHtml();
  if (!file) {
    console.error(
      "usage: liebstoeckel push [deck.html] [--title <t>] [--name <key>] [--new] [--org <slug>] [--api <host>]\n" +
        "  (no path → the built deck in ./dist; run `liebstoeckel build` first)",
    );
    process.exit(1);
  }
  const api = (args.api ?? creds?.api ?? "").replace(/\/+$/, "");
  if (!creds || !api) notLoggedIn();

  const path = resolve(file);
  if (!(await Bun.file(path).exists())) {
    console.error(`✕ no such file: ${file}`);
    process.exit(1);
  }
  const html = await Bun.file(path).text();
  const deckName = args.name ?? deckNameFromPath(path) ?? basename(file).replace(/\.html?$/i, "");
  // Deck key ((internal ADR)): re-push upserts by it. `--new` forces a fresh deck by
  // uniquifying the key, so the same folder can also start a separate deck.
  const fresh = !!args.new;
  const deckKey = fresh ? `${slugifyKey(deckName)}-${Math.random().toString(36).slice(2, 8)}` : slugifyKey(deckName);

  const headers: Record<string, string> = {
    authorization: `Bearer ${creds.token}`,
    "content-type": "text/html",
    "x-deck-key": deckKey,
  };
  // Title precedence ((internal ADR)): the server parses the deck's own `<title>`, so we
  // only send a header when the user explicitly overrides it with `--title`. It's
  // URL-encoded because non-Latin1 chars (em-dash, smart quotes, emoji) are illegal
  // in HTTP header values.
  const titleOverride = args.title;
  if (titleOverride) headers["x-deck-title"] = encodeURIComponent(titleOverride);
  if (org) headers["x-org-slug"] = org;

  const res = await fetch(`${api}/api/v1/decks`, { method: "POST", headers, body: html });
  if (res.status === 401) {
    console.error("✕ session expired, run `liebstoeckel login` again.");
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
  const { deck, version, isNew } = (await res.json()) as {
    deck: { id: string; title: string };
    version: number;
    isNew: boolean;
  };
  const what = isNew ? "created" : `updated to v${version}`;
  console.log(`\n✓ pushed "${deck.title}" (${what})${org ? ` in ${org}` : ""}, view it at ${api}\n`);
}

interface OrgList {
  active: { slug: string; name: string; role: string; personal: boolean; plan: string };
  orgs: Array<{ slug: string; name: string; personal: boolean }>;
}

async function fetchOrgs(api: string, token: string): Promise<OrgList> {
  const res = await fetch(`${api}/api/v1/orgs`, { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    console.error("✕ session expired, run `liebstoeckel login` again.");
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`✕ could not list orgs: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  return (await res.json()) as OrgList;
}

/** Auth preamble shared by the org/deck/brand commands: load creds, resolve the
 *  API host (`--api` > stored), and bail with the "coming soon" notice if absent. */
async function requireCreds(apiArg?: string) {
  const creds = await loadCreds();
  const api = (apiArg ?? creds?.api ?? "").replace(/\/+$/, "");
  if (!creds || !api) notLoggedIn();
  return { creds, api };
}

const orgsUseCommand = defineCommand({
  meta: { name: "use", description: "set the default org for `push`" },
  args: { slug: { type: "positional", required: false, description: "org slug", valueHint: "slug" }, api: CLOUD_ARGS.api },
  async run({ args }) {
    const { creds, api } = await requireCreds(args.api);
    if (!args.slug) {
      console.error("usage: liebstoeckel orgs use <slug>");
      process.exit(1);
    }
    const { orgs } = await fetchOrgs(api, creds.token);
    const match = orgs.find((o) => o.slug === args.slug);
    if (!match) {
      console.error(`✕ no org "${args.slug}", you're a member of: ${orgs.map((o) => o.slug).join(", ")}`);
      process.exit(1);
    }
    await saveCreds({ ...creds, org: match.personal ? undefined : match.slug });
    console.log(`\n✓ pushes now go to ${match.name} (${match.slug})\n`);
  },
});

const orgsListCommand = defineCommand({
  meta: { name: "list", description: "list your workspaces" },
  args: { api: CLOUD_ARGS.api },
  async run({ args }) {
    const { creds, api } = await requireCreds(args.api);
    const { active, orgs } = await fetchOrgs(api, creds.token);
    const def = creds.org;
    console.log("\n  your workspaces:\n");
    for (const o of orgs) {
      const marker = (def ? o.slug === def : o.personal) ? "→" : " ";
      const tags = o.personal ? "  (personal)" : "";
      console.log(`   ${marker} ${o.slug.padEnd(24)} ${o.name}${tags}`);
    }
    console.log(`\n  plan: ${active.plan}   → = default for \`push\` (change: liebstoeckel orgs use <slug>)\n`);
  },
});

export const orgsCommand = defineCommand({
  meta: { name: "orgs", description: "list your workspaces / set the default org, coming soon" },
  subCommands: { list: orgsListCommand, use: orgsUseCommand },
  default: "list",
});

interface CloudDeck {
  id: string;
  title: string;
  version: number;
  shared: boolean;
  shareSlug: string | null;
  views: number;
  uniqueViews: number;
}

/** `liebstoeckel decks [--org <slug>]`, list the active org's decks + views. */
export const decksCommand = defineCommand({
  meta: { name: "decks", description: "list your cloud decks (with view counts), coming soon" },
  args: { org: CLOUD_ARGS.org, api: CLOUD_ARGS.api },
  run: ({ args }) => runDecks(args),
});

async function runDecks(args: { org?: string; api?: string }): Promise<void> {
  const { creds, api } = await requireCreds(args.api);
  const org = resolveOrg(args, creds?.org);
  const headers: Record<string, string> = { authorization: `Bearer ${creds.token}` };
  if (org) headers["x-org-slug"] = org;
  const res = await fetch(`${api}/api/v1/decks`, { headers });
  if (res.status === 401) {
    console.error("✕ session expired, run `liebstoeckel login` again.");
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
    console.log(`\n  no decks${org ? ` in ${org}` : ""} yet, push one with: liebstoeckel push\n`);
    return;
  }
  console.log(`\n  decks${org ? ` in ${org}` : ""}:\n`);
  for (const d of decks) {
    const share = d.shared ? "shared" : "private";
    const ver = `v${d.version}`.padStart(4);
    console.log(`   ${d.title.slice(0, 36).padEnd(36)} ${ver}  ${String(d.views).padStart(5)} views  ${share}`);
  }
  console.log();
}

// ── brand registry ((internal ADR)): the org is an authenticated registry; brands are
// items pulled into decks as owned source (brands/<name>.ts), baked at build. ──

interface BrandRow {
  name: string;
  isDefault: boolean;
  tokens: Record<string, string>;
}

/** Map a `defineTheme(...)` Theme (or a flat tokens object) → the server's flat
 *  token shape. Used by `brand push`. */
export function themeToTokens(input: unknown): Record<string, unknown> {
  const m = input as {
    colors?: Record<string, string>;
    fonts?: Record<string, string>;
    glow?: { a?: string; b?: string };
    viz?: string[];
  };
  if (!m.colors) return (input ?? {}) as Record<string, unknown>; // already flat
  const c = m.colors, f = m.fonts ?? {}, g = m.glow ?? {};
  return {
    bg: c.bg, surface: c.surface, border: c.border ?? "", text: c.text, muted: c.muted,
    primary: c.primary, accent: c.accent, accent2: c.accent2 ?? "", onPrimary: c.onPrimary,
    fontHeading: f.heading ?? "", fontBody: f.body ?? "", fontMono: f.mono ?? "",
    glowA: g.a ?? "", glowB: g.b ?? "",
    // The viz palette rides along ((internal ticket)); the server normalizes/bounds it.
    ...(Array.isArray(m.viz) ? { viz: m.viz } : {}),
  };
}

async function brandApi(args: { api?: string; org?: string }): Promise<{ api: string; token: string; org?: string }> {
  const { creds, api } = await requireCreds(args.api);
  return { api, token: creds.token, org: resolveOrg(args, creds.org) };
}

function brandHeaders(token: string, org?: string): Record<string, string> {
  const h: Record<string, string> = { authorization: `Bearer ${token}` };
  if (org) h["x-org-slug"] = org;
  return h;
}

const brandPushCommand = defineCommand({
  meta: { name: "push", description: "push a brand (theme token set) to the org registry" },
  args: {
    file: { type: "positional", required: false, description: "brand .ts or tokens .json", valueHint: "brand.ts|tokens.json" },
    name: { type: "string", description: "brand key (default: the theme name / filename)", valueHint: "key" },
    default: { type: "boolean", description: "mark this the org default brand" },
    org: CLOUD_ARGS.org,
    api: CLOUD_ARGS.api,
  },
  async run({ args }) {
    const { api, token, org } = await brandApi(args);
    const file = args.file;
    if (!file) {
      console.error("usage: liebstoeckel brand push <brand.ts|tokens.json> [--name <key>] [--default] [--org <slug>]");
      process.exit(1);
    }
    const path = resolve(file);
    if (!(await Bun.file(path).exists())) {
      console.error(`✕ no such file: ${file}`);
      process.exit(1);
    }
    let parsed: unknown;
    if (/\.json$/i.test(path)) parsed = await Bun.file(path).json();
    else parsed = (await import(path)).default; // a defineTheme(...) module
    const tokens = themeToTokens(parsed);
    const name =
      args.name ??
      (parsed as { name?: string })?.name ??
      basename(file).replace(/\.(ts|tsx|js|json)$/i, "");
    const res = await fetch(`${api}/api/v1/orgs/brands/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: { ...brandHeaders(token, org), "content-type": "application/json" },
      body: JSON.stringify({ tokens, default: !!args.default }),
    });
    if (res.status === 403) {
      console.error("✕ forbidden, managing brands needs an admin/owner role on a paid org.");
      process.exit(1);
    }
    if (!res.ok) {
      console.error(`✕ push failed: ${res.status} ${await res.text()}`);
      process.exit(1);
    }
    console.log(`\n✓ pushed brand "${name}"${args.default ? " (default)" : ""}${org ? ` to ${org}` : ""}`);
    // Warn about fonts the catalog can't ship a webfont for ((internal ADR)); they fall
    // back to system fonts on pull unless the deck supplies its own @font-face.
    const { warnings } = (await res.json().catch(() => ({}))) as {
      warnings?: { field: string; family: string; suggestion?: string }[];
    };
    if (warnings?.length) {
      console.log("⚠ these fonts aren't in the catalog, they'll fall back to system fonts on pull");
      console.log("  unless the deck supplies @font-face:");
      for (const w of warnings) {
        console.log(`    ${w.field}: ${w.family}${w.suggestion ? `   (did you mean "${w.suggestion}"?)` : ""}`);
      }
    }
    console.log();
  },
});

const brandPullCommand = defineCommand({
  meta: { name: "pull", description: "pull a brand into a deck as owned source" },
  args: {
    name: { type: "positional", required: false, description: "brand name (default: the org default)", valueHint: "name" },
    dir: { type: "string", description: "target deck directory (default: cwd)", valueHint: "deck" },
    install: { type: "boolean", default: true, description: "install the brand's catalog fonts", negativeDescription: "do not install fonts" },
    org: CLOUD_ARGS.org,
    api: CLOUD_ARGS.api,
  },
  async run({ args }) {
    const { api, token, org } = await brandApi(args);
    let name = args.name;
    const dir = args.dir ?? ".";
    if (!name) {
      const def = (await fetchBrands(api, token, org)).find((b) => b.isDefault);
      if (!def) {
        console.error("✕ no default brand set, run `liebstoeckel brand list` or pass a name.");
        process.exit(1);
      }
      name = def.name;
    }
    // The brand IS a registry item, resolve it through the @org transport and
    // write it as owned source, exactly like `add @org/<name>` ((internal ADR)).
    const { httpTransport, resolveScaffold } = await import("./add");
    const transport = httpTransport(`${api}/api/v1/orgs/registry`, brandHeaders(token, org), "@org");
    const plan = await resolveScaffold(transport, [name]);
    const deckDir = resolve(dir);
    for (const f of plan.files) await Bun.write(join(deckDir, f.target), f.content);
    console.log(`\n✓ pulled brand "${name}" → ${plan.files.map((f) => f.target).join(", ")}\n`);
    // The brand's catalog fonts ((internal ADR)) ride along as npm deps; install them so the
    // deck bundles the webfont at build (the brand file `import`s the package).
    const deps = plan.npmDependencies;
    const noInstall = args.install === false;
    if (deps.length && !noInstall) {
      const { $ } = await import("bun");
      console.log(`   installing fonts: bun add --ignore-scripts ${deps.join(" ")}`);
      // pin the interpreter; --ignore-scripts per the registry trust model ((internal ADR))
      await $`${bunBin} add --ignore-scripts ${deps}`.cwd(deckDir);
      console.log(`   ✓ fonts installed\n`);
    } else if (deps.length) {
      console.log(`   → install its fonts: bun add --ignore-scripts ${deps.join(" ")}\n`);
    }
    console.log(`   wire it in main.tsx:\n     import ${camel(name)} from "./brands/${name}";`);
    console.log(`     <Present brands={["${name}"]} brandThemes={[${camel(name)}]} … />\n`);
  },
});

const brandListCommand = defineCommand({
  meta: { name: "list", description: "list the org's shared brands" },
  args: { org: CLOUD_ARGS.org, api: CLOUD_ARGS.api },
  async run({ args }) {
    const { api, token, org } = await brandApi(args);
    const brands = await fetchBrands(api, token, org);
    if (!brands.length) {
      console.log(`\n  no brands${org ? ` in ${org}` : ""} yet, push one: liebstoeckel brand push ./brand.ts --default\n`);
      return;
    }
    console.log(`\n  brands${org ? ` in ${org}` : ""}:\n`);
    for (const b of brands) console.log(`   ${b.isDefault ? "→" : " "} ${b.name}`);
    console.log(`\n  → = default (applied by \`liebstoeckel new\`). Pull one: liebstoeckel brand pull <name>\n`);
  },
});

/** `liebstoeckel brand list|push|pull`, share org brands (registry, (internal ADR)). */
export const brandCommand = defineCommand({
  meta: { name: "brand", description: "share org brands: push/pull theme token sets, coming soon" },
  subCommands: { list: brandListCommand, push: brandPushCommand, pull: brandPullCommand },
  default: "list",
});

async function fetchBrands(api: string, token: string, org?: string): Promise<BrandRow[]> {
  const res = await fetch(`${api}/api/v1/orgs/brands`, { headers: brandHeaders(token, org) });
  if (res.status === 401) {
    console.error("✕ session expired, run `liebstoeckel login` again.");
    process.exit(1);
  }
  if (res.status === 403) {
    console.error("✕ the org registry is a paid feature for this workspace.");
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`✕ could not list brands: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  return (await res.json() as { brands: BrandRow[] }).brands;
}

const camel = (s: string) => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

/** For `liebstoeckel new`: the org default brand's source + name (+ its `@fontsource`
 *  deps, (internal ADR), so the scaffolded package.json installs them), or null. Best
 *  effort, never blocks scaffolding if not logged in / no default. */
export async function fetchDefaultBrand(): Promise<{ name: string; source: string; dependencies: string[] } | null> {
  try {
    const creds = await loadCreds();
    if (!creds?.token || !creds.api) return null;
    const api = creds.api.replace(/\/+$/, "");
    const list = await fetch(`${api}/api/v1/orgs/brands`, { headers: brandHeaders(creds.token, creds.org) });
    if (!list.ok) return null;
    const def = ((await list.json()) as { brands: BrandRow[] }).brands.find((b) => b.isDefault);
    if (!def) return null;
    const src = await fetch(`${api}/api/v1/orgs/registry/files/brands/${encodeURIComponent(def.name)}.ts`, {
      headers: brandHeaders(creds.token, creds.org),
    });
    if (!src.ok) return null;
    const source = await src.text();
    return { name: def.name, source, dependencies: fontPackagesFromSource(source) };
  } catch {
    return null;
  }
}

/** The `@fontsource` side-effect imports a pulled brand source declares ((internal ADR)), *  the deck's font deps. Inlined here (not imported from control-core) to keep the
 *  OSS CLI free of the private control plane. */
export function fontPackagesFromSource(source: string): string[] {
  const pkgs = new Set<string>();
  for (const m of source.matchAll(/^import\s+"(@fontsource[^"]+)";/gm)) pkgs.add(m[1]!);
  return [...pkgs].sort();
}
