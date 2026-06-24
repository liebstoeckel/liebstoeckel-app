import { defineCommand } from "citty";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  validateItem,
  assertSafeTarget,
  CATEGORIES,
  type RegistryItem,
} from "@liebstoeckel/registry/schema";
import { bunBin } from "./bun";

/**
 * `liebstoeckel add`, scaffold registry items into a deck as owned source
 * ((internal ADR)), resolved over a pluggable transport ((internal ADR)). The resolver core
 * (`resolveScaffold`) is pure given a transport, so it is unit-tested with an
 * in-memory transport; only `runAdd` touches disk / spawns `bun add`.
 */

// ── transport ───────────────────────────────────────────────────────────────

export interface RegistryTransport {
  /** Namespace label, for messages. */
  readonly id: string;
  /** Read an item manifest by name (`items/<name>.json`). */
  readItem(name: string): Promise<unknown>;
  /** Read a source file by its registry-relative path (`files/…`). */
  readFile(path: string): Promise<string>;
}

function assertSafeRelPath(p: string): void {
  if (p.startsWith("/") || p.split(/[\\/]/).includes("..")) {
    throw new Error(`unsafe registry file path "${p}"`);
  }
}

/**
 * Reads a registry laid out as a local directory, the default/workspace registry,
 * and also how an npm/git carrier is read once installed to a temp dir ((internal ADR)).
 */
export function localTransport(root: string, id = "@liebstoeckel"): RegistryTransport {
  return {
    id,
    async readItem(name) {
      const f = Bun.file(join(root, "items", `${name}.json`));
      if (!(await f.exists())) throw new Error(`item "${name}" not found in registry ${id}`);
      return f.json();
    },
    readFile(path) {
      assertSafeRelPath(path);
      return Bun.file(join(root, path)).text();
    },
  };
}

/**
 * Reads a registry over authenticated HTTP, an org's cloud registry, or any
 * `https://…` registry configured in `liebstoeckel.json` ((internal ADR)/0059). Speaks
 * the same protocol: `<base>/items/<name>.json` and `<base>/files/<path>`.
 */
export function httpTransport(baseUrl: string, headers: Record<string, string>, id: string): RegistryTransport {
  const base = baseUrl.replace(/\/+$/, "");
  const fail = (what: string, res: Response): Error => {
    if (res.status === 401) return new Error(`registry ${id}: not signed in, run \`liebstoeckel login\``);
    if (res.status === 403) return new Error(`registry ${id}: forbidden (membership/plan), check \`liebstoeckel orgs\``);
    return new Error(`registry ${id}: ${what} (HTTP ${res.status})`);
  };
  return {
    id,
    async readItem(name) {
      const res = await fetch(`${base}/items/${encodeURIComponent(name)}.json`, { headers });
      if (!res.ok) throw fail(`item "${name}" not found`, res);
      return res.json();
    },
    async readFile(path) {
      assertSafeRelPath(path);
      // `path` already includes its `files/…` prefix (same as localTransport's
      // join(root, path)); the registry base serves it directly.
      const safe = path.split("/").map(encodeURIComponent).join("/");
      const res = await fetch(`${base}/${safe}`, { headers });
      if (!res.ok) throw fail(`file "${path}" not found`, res);
      return res.text();
    },
  };
}

/** Auth headers for the logged-in org's registry (`@org`). Throws if not logged in. */
export async function orgRegistryAuth(): Promise<{ baseUrl: string; headers: Record<string, string> }> {
  const { loadCreds } = await import("./creds");
  const creds = await loadCreds();
  if (!creds?.token || !creds.api) {
    throw new Error("the @org registry needs login, run `liebstoeckel login --api <host>`");
  }
  const headers: Record<string, string> = { authorization: `Bearer ${creds.token}` };
  if (creds.org) headers["x-org-slug"] = creds.org;
  return { baseUrl: `${creds.api.replace(/\/+$/, "")}/api/v1/orgs/registry`, headers };
}

// ── resolver core (pure given a transport) ───────────────────────────────────

export interface ResolvedFile {
  target: string;
  content: string;
  item: string;
}

export interface ResolvedScaffold {
  /** Item names in resolution order (registryDependencies before dependents). */
  items: string[];
  files: ResolvedFile[];
  /** Union of leaf npm deps to add to the deck, sorted. */
  npmDependencies: string[];
}

/**
 * Transitively resolve items + their `registryDependencies` into a flat, deduped
 * plan. Each manifest is validated (which also enforces the banned-visx gate) and
 * each `target` is checked for path-escape before it can be written.
 */
export async function resolveScaffold(
  transport: RegistryTransport,
  names: string[],
): Promise<ResolvedScaffold> {
  const seen = new Set<string>();
  const items: string[] = [];
  const files: ResolvedFile[] = [];
  const deps = new Set<string>();

  async function visit(name: string): Promise<void> {
    if (seen.has(name)) return;
    seen.add(name);
    const raw = await transport.readItem(name);
    validateItem(raw);
    const item = raw as RegistryItem;
    // deps first, so registryDependencies land before dependents (axes before chart)
    for (const dep of item.registryDependencies ?? []) await visit(dep);
    for (const d of item.dependencies ?? []) deps.add(d);
    for (const f of item.files) {
      assertSafeTarget(f.target);
      files.push({ target: f.target, content: await transport.readFile(f.path), item: item.name });
    }
    items.push(item.name);
  }

  for (const n of names) await visit(n);
  return { items, files, npmDependencies: [...deps].sort() };
}

// ── command ──────────────────────────────────────────────────────────────────

interface DeckConfig {
  registries: Record<string, string>;
}

async function loadConfig(deckDir: string): Promise<DeckConfig> {
  const f = Bun.file(join(deckDir, "liebstoeckel.json"));
  if (await f.exists()) {
    try {
      const j = (await f.json()) as Partial<DeckConfig>;
      return { registries: j.registries ?? {} };
    } catch {
      /* fall through to defaults */
    }
  }
  return { registries: {} };
}

function parseRef(ref: string): { ns: string; name: string } {
  if (ref.startsWith("@")) {
    const slash = ref.indexOf("/");
    if (slash > 0) return { ns: ref.slice(0, slash), name: ref.slice(slash + 1) };
  }
  return { ns: "@liebstoeckel", name: ref };
}

/** True iff two URLs share an exact origin (scheme + host + port). Used to gate
 *  attaching the stored cloud bearer token to a registry request. A parsed-origin
 *  compare (not a string prefix) prevents a deck-controlled registry URL that merely
 *  *starts with* the API host from siphoning the token to an attacker. */
export function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

async function transportFor(ns: string, deckDir: string, config: DeckConfig): Promise<RegistryTransport> {
  const spec = config.registries[ns];
  // default registry: bundled @liebstoeckel/registry, read as a local file tree
  if ((ns === "@liebstoeckel" && spec == null) || spec === "default") {
    const { REGISTRY_ROOT } = await import("@liebstoeckel/registry");
    return localTransport(REGISTRY_ROOT, ns);
  }
  // @org: the logged-in org's authenticated cloud registry ((internal ADR)), no config needed
  if (ns === "@org" && (spec == null || spec === "org")) {
    const { baseUrl, headers } = await orgRegistryAuth();
    return httpTransport(baseUrl, headers, ns);
  }
  if (spec == null) {
    throw new Error(`no registry configured for namespace "${ns}", add it to liebstoeckel.json "registries"`);
  }
  if (spec.startsWith(".") || spec.startsWith("/")) {
    return localTransport(resolve(deckDir, spec), ns);
  }
  if (spec.startsWith("http://") || spec.startsWith("https://")) {
    // Authenticated HTTP registry ((internal ADR)/0059). Auto-attach the stored bearer token
    // ONLY when the registry's origin is *exactly* the host we logged into. The registry
    // URL comes from the deck's own liebstoeckel.json, so it is attacker-controlled for a
    // cloned/third-party deck — compare parsed origins (scheme + host + port), never a
    // string prefix: `startsWith` also matched a sibling-suffix host like
    // `api.example.com.evil.com` or a `https://api.example.com@evil.com` userinfo URL,
    // leaking the token to the attacker.
    const headers: Record<string, string> = {};
    const { loadCreds } = await import("./creds");
    const creds = await loadCreds();
    if (creds?.token && creds.api && sameOrigin(spec, creds.api)) {
      headers.authorization = `Bearer ${creds.token}`;
    }
    return httpTransport(spec, headers, ns);
  }
  // (internal ADR) also lists npm/git transports as planned; not wired yet.
  throw new Error(
    `registry transport "${spec}" (namespace ${ns}) is not implemented yet, ` +
      `bundled default, local-path, @org, and http(s) registries are wired ((internal ADR) plans npm/git).`,
  );
}

/** Optional `add <category> <name>...` sugar: strip a leading **singular** category
 *  keyword (`chart`, `hook`, …) when at least one item name follows it. Pure, the
 *  category words are exactly `CATEGORIES`, never their plurals ((internal ticket)). */
export function stripCategory(positionals: string[]): string[] {
  if (positionals.length >= 2 && (CATEGORIES as readonly string[]).includes(positionals[0]!)) {
    return positionals.slice(1);
  }
  return positionals;
}

export const addCommand = defineCommand({
  meta: {
    name: "add",
    description: "scaffold registry items (chart, hook, …) into a deck as owned source",
  },
  args: {
    items: {
      type: "positional",
      required: false,
      description: "registry item name(s), optionally after a category keyword",
      valueHint: "[category] name...",
    },
    dir: { type: "string", description: "target deck directory (default: cwd)", valueHint: "deck" },
    dry: { type: "boolean", description: "print the plan without writing anything" },
    force: { type: "boolean", description: "overwrite existing files" },
    install: {
      type: "boolean",
      default: true,
      description: "install npm dependencies the items need",
      negativeDescription: "do not run bun add for dependencies",
    },
    json: { type: "boolean", description: "machine-readable JSON output (default when piped)" },
  },
  run: (ctx) => runAdd(ctx.args),
});

async function runAdd(args: {
  _: string[];
  dir?: string;
  dry?: boolean;
  force?: boolean;
  install?: boolean;
  json?: boolean;
}): Promise<void> {
  const refs = stripCategory(args._);
  if (refs.length === 0) {
    console.error(
      "usage: liebstoeckel add [<category>] <name>... [--dir <deck>] [--dry] [--force] [--no-install]",
    );
    process.exit(1);
  }

  const deckDir = resolve(args.dir ?? ".");
  const dry = !!args.dry;
  const force = !!args.force;
  const noInstall = args.install === false;
  // JSON when asked, or when piped (an agent), pretty only on an interactive TTY ((internal ADR)).
  const json = !!args.json || !process.stdout.isTTY;

  try {
    const config = await loadConfig(deckDir);

    // group refs by namespace; each namespace resolves through its own transport
    const groups = new Map<string, { transport: RegistryTransport; names: string[] }>();
    for (const ref of refs) {
      const { ns, name } = parseRef(ref);
      if (!groups.has(ns)) groups.set(ns, { transport: await transportFor(ns, deckDir, config), names: [] });
      groups.get(ns)!.names.push(name);
    }

    const items: string[] = [];
    const files: ResolvedFile[] = [];
    const deps = new Set<string>();
    for (const g of groups.values()) {
      const plan = await resolveScaffold(g.transport, g.names);
      items.push(...plan.items);
      files.push(...plan.files);
      for (const d of plan.npmDependencies) deps.add(d);
    }

    // plan, computed before writing ((internal ADR) review-before-write)
    const plan = files.map((f) => {
      const exists = existsSync(join(deckDir, f.target));
      const action = exists && !force ? "skip" : exists ? "overwrite" : "create";
      return { target: f.target, item: f.item, action, file: f };
    });
    const writes = plan.filter((p) => p.action !== "skip").map((p) => p.file);
    const dependencies = [...deps];

    if (!json) {
      console.log(`\nliebstoeckel add ${items.join(", ")}  →  ${deckDir}\n`);
      for (const p of plan) console.log(`   ${(p.action === "skip" ? "skip (exists)" : p.action).padEnd(14)} ${p.target}   [${p.item}]`);
      if (dependencies.length) console.log(`\n   dependencies: ${dependencies.join(", ")}`);
    }

    if (dry) {
      if (json) {
        console.log(JSON.stringify({ action: "plan", dir: deckDir, items, files: plan.map(({ file, ...p }) => p), dependencies }, null, 2));
      } else {
        console.log(`\n   (dry run, nothing written)\n`);
      }
      return;
    }

    for (const f of writes) await Bun.write(join(deckDir, f.target), f.content);

    let installed = false;
    if (deps.size && !noInstall) {
      const { $ } = await import("bun");
      // pin the interpreter; --ignore-scripts per the registry trust model ((internal ADR))
      const proc = $`${bunBin} add --ignore-scripts ${dependencies}`.cwd(deckDir);
      if (json) await proc.quiet();
      else {
        console.log(`\n   ✓ wrote ${writes.length} file(s)` + (writes.length < files.length ? ` (${files.length - writes.length} skipped, use --force to overwrite)` : ""));
        console.log(`   installing: bun add --ignore-scripts ${dependencies.join(" ")}`);
        await proc;
        console.log(`   ✓ dependencies installed`);
      }
      installed = true;
    } else if (!json) {
      console.log(`\n   ✓ wrote ${writes.length} file(s)` + (writes.length < files.length ? ` (${files.length - writes.length} skipped, use --force to overwrite)` : ""));
      if (deps.size) console.log(`   → install deps yourself: bun add --ignore-scripts ${dependencies.join(" ")}`);
    }

    if (json) {
      console.log(JSON.stringify({
        action: "add",
        dir: deckDir,
        items,
        wrote: writes.map((f) => f.target),
        skipped: plan.filter((p) => p.action === "skip").map((p) => p.target),
        dependencies,
        installed,
      }, null, 2));
    } else {
      console.log();
    }
  } catch (e) {
    if (json) console.log(JSON.stringify({ error: (e as Error).message }));
    else console.error(`✕ ${(e as Error).message}`);
    process.exit(1);
  }
}
