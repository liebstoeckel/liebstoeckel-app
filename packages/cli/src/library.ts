// `liebstoeckel decks list|move|delete` and `liebstoeckel folders
// list|create|rename|delete`: the cloud deck library of an organization. Folders
// are purely organizational: they change nothing about who sees or manages a
// deck. Decks are named by id or deck key, folders by path ("Sales/Q4", "/" for
// the root), and every command targets an org the way the other cloud commands
// do (`--org`, else the default from `orgs use`, else the personal workspace).
import { defineCommand } from "citty";
import { createInterface } from "node:readline/promises";
import { CLOUD_ARGS, httpFailure, JSON_ARG, requireCreds, resolveOrg } from "./cloud";
import { bodyExcerpt, CliError, reporting, usageError, wantsJson } from "./output";

export interface CloudDeck {
  id: string;
  deckKey: string | null;
  title: string;
  version: number;
  shared: boolean;
  shareSlug: string | null;
  views: number;
  uniqueViews: number;
  createdBy?: string;
  folderId?: string | null;
}

export interface CloudFolder {
  id: string;
  parentId: string | null;
  name: string;
  path: string;
}

interface Cloud {
  api: string;
  org?: string;
  headers: Record<string, string>;
}

/** The options every library command takes. */
const LIBRARY_ARGS = { org: CLOUD_ARGS.org, api: CLOUD_ARGS.api, json: JSON_ARG };

// Options given before the subcommand (`decks --org acme move ...`) are parsed
// by the parent command; they are kept here so the subcommand still sees them
// rather than silently acting on another org.
let parentArgs: { org?: string; api?: string; json?: boolean } = {};
const keepParentArgs = ({ args }: { args: Record<string, unknown> }) => {
  parentArgs = {
    org: typeof args.org === "string" ? args.org : undefined,
    api: typeof args.api === "string" ? args.api : undefined,
    json: typeof args.json === "boolean" ? args.json : undefined,
  };
};
const withParent = <T extends { org?: string; api?: string; json?: boolean }>(args: T): T => ({
  ...args,
  org: args.org ?? parentArgs.org,
  api: args.api ?? parentArgs.api,
  json: args.json ?? parentArgs.json,
});

async function cloud(args: { org?: string; api?: string }): Promise<Cloud> {
  const { creds, api } = await requireCreds(args.api);
  const org = resolveOrg(args, creds.org);
  const headers: Record<string, string> = { authorization: `Bearer ${creds.token}` };
  if (org) headers["x-org-slug"] = org;
  return { api, org, headers };
}

/** A control-plane answer that says why, in its own words, for a request that
 *  has a reason to refuse (a folder or bulk request). */
async function refusal(res: Response, what: string, cl: Cloud): Promise<CliError> {
  if (res.status === 401 || (res.status === 403 && !res.headers.get("content-type")?.includes("json"))) {
    return httpFailure(res, what, `you're not a member of org "${cl.org}"`);
  }
  const text = await res.clone().text();
  let body: { error?: string; code?: string; refused?: { id: string; reason: string }[] } = {};
  try {
    body = JSON.parse(text);
  } catch {
    /* not a JSON answer */
  }
  if (!body.error) return httpFailure(res, what, `you're not a member of org "${cl.org}"`);
  const code = body.code ?? (res.status === 403 ? "forbidden" : res.status === 404 ? "not_found" : "request_failed");
  return new CliError(body.error, { code, details: body.refused ? { refused: body.refused } : undefined });
}

async function call<T>(cl: Cloud, method: string, path: string, what: string, body?: unknown): Promise<T> {
  const res = await fetch(`${cl.api}/api/v1${path}`, {
    method,
    headers: body === undefined ? cl.headers : { ...cl.headers, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status >= 500) throw new CliError(`${what}: ${res.status} ${await bodyExcerpt(res)}`.trim(), { code: "request_failed" });
    throw await refusal(res, what, cl);
  }
  return (await res.json()) as T;
}

const fetchDecks = async (cl: Cloud) =>
  (await call<{ decks: CloudDeck[] }>(cl, "GET", "/decks", "could not list decks")).decks;

/** The org's folders; empty on a control plane that has none yet. */
async function fetchFolders(cl: Cloud): Promise<CloudFolder[]> {
  const res = await fetch(`${cl.api}/api/v1/folders`, { headers: cl.headers });
  if (res.status === 404) return [];
  if (!res.ok) throw await refusal(res, "could not list folders", cl);
  return ((await res.json()) as { folders: CloudFolder[] }).folders;
}

// ── pure helpers (unit-tested) ───────────────────────────────────────────────

/** Normalize a folder path for lookups: trimmed segments, no empty ones. "" is the root. */
export function normalizePath(path: string): string {
  return path
    .split("/")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("/");
}

/** The folder at `path` (matched regardless of case), null for the root ("/" or
 *  ""), undefined when there is no such folder. */
export function folderAt(folders: CloudFolder[], path: string): CloudFolder | null | undefined {
  const want = normalizePath(path).toLowerCase();
  if (!want) return null;
  return folders.find((f) => f.path.toLowerCase() === want);
}

/** Resolve the decks named on the command line, by id or deck key. */
export function pickDecks(decks: CloudDeck[], refs: string[]): { found: CloudDeck[]; missing: string[] } {
  const found: CloudDeck[] = [];
  const missing: string[] = [];
  for (const ref of refs) {
    const hit = decks.find((d) => d.id === ref) ?? decks.find((d) => d.deckKey === ref);
    if (!hit) missing.push(ref);
    else if (!found.includes(hit)) found.push(hit);
  }
  return { found, missing };
}

/** The folders as an indented tree, children sorted by name. */
export function folderTree(folders: CloudFolder[]): string[] {
  const kids = new Map<string | null, CloudFolder[]>();
  for (const f of folders) kids.set(f.parentId, [...(kids.get(f.parentId) ?? []), f]);
  const lines: string[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const f of (kids.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(`${"  ".repeat(depth)}${f.name}`);
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return lines;
}

const pathOf = (folders: CloudFolder[], id: string | null | undefined) =>
  id ? (folders.find((f) => f.id === id)?.path ?? null) : null;

function requireDecks(decks: CloudDeck[], refs: string[]): CloudDeck[] {
  const { found, missing } = pickDecks(decks, refs);
  if (missing.length) {
    throw new CliError(`no deck ${missing.map((m) => `"${m}"`).join(", ")} in this workspace`, {
      code: "not_found",
      hint: "`liebstoeckel decks list` shows each deck's key and id",
      details: { missing },
    });
  }
  return found;
}

function requireFolder(folders: CloudFolder[], path: string): CloudFolder | null {
  const f = folderAt(folders, path);
  if (f === undefined) {
    throw new CliError(`no folder "${normalizePath(path)}"`, {
      code: "folder_not_found",
      hint: `create it with: liebstoeckel folders create ${JSON.stringify(normalizePath(path))}`,
    });
  }
  return f;
}

/** A bulk refusal in prose: which decks, and why. Nothing changed. */
function explainRefusal(err: unknown, decks: CloudDeck[]): unknown {
  if (!(err instanceof CliError) || !Array.isArray(err.details?.refused)) return err;
  const lines = (err.details.refused as { id: string; reason: string }[]).map((r) => {
    const d = decks.find((x) => x.id === r.id);
    const why = r.reason === "forbidden" ? "not yours to manage (only its creator, an owner or an admin can)" : "not found";
    return `${d ? `"${d.title}"` : r.id}: ${why}`;
  });
  return new CliError(err.message, { code: err.code, hint: lines.join("; "), details: err.details });
}

// ── decks ───────────────────────────────────────────────────────────────────

const decksListCommand = defineCommand({
  meta: { name: "list", description: "list the org's cloud decks with key, folder and views" },
  args: LIBRARY_ARGS,
  run({ args }) {
    const a = withParent(args);
    const json = wantsJson(a.json);
    return reporting(json, async () => {
      const cl = await cloud(a);
      const [decks, folders] = await Promise.all([fetchDecks(cl), fetchFolders(cl)]);
      if (json) {
        console.log(
          JSON.stringify({
            org: cl.org ?? null,
            decks: decks.map((d) => ({
              id: d.id,
              key: d.deckKey ?? null,
              title: d.title,
              folderId: d.folderId ?? null,
              folder: pathOf(folders, d.folderId),
              version: d.version,
              shared: d.shared,
              shareSlug: d.shareSlug,
              views: d.views,
              uniqueViews: d.uniqueViews,
            })),
          }),
        );
        return;
      }
      if (!decks.length) {
        console.log(`\n  no decks${cl.org ? ` in ${cl.org}` : ""} yet, push one with: liebstoeckel push\n`);
        return;
      }
      console.log(`\n  decks${cl.org ? ` in ${cl.org}` : ""}:\n`);
      const rows = decks
        .map((d) => ({ d, folder: pathOf(folders, d.folderId) ?? "/" }))
        .sort((x, y) => x.folder.localeCompare(y.folder));
      for (const { d, folder } of rows) {
        const share = d.shared ? "shared" : "private";
        const ver = `v${d.version}`.padStart(4);
        const key = (d.deckKey ?? d.id).slice(0, 24).padEnd(24);
        console.log(
          `   ${d.title.slice(0, 32).padEnd(32)} ${key} ${folder.slice(0, 24).padEnd(24)} ${ver}  ${String(d.views).padStart(5)} views  ${share}`,
        );
      }
      console.log(`\n  columns: title, key (or id), folder, version, views, sharing\n`);
    });
  },
});

const decksMoveCommand = defineCommand({
  meta: { name: "move", description: "move decks into a folder (all or nothing)" },
  args: {
    decks: { type: "positional", required: false, description: "deck ids or keys", valueHint: "deck..." },
    to: { type: "string", description: 'target folder path, "/" for the root', valueHint: "path" },
    ...LIBRARY_ARGS,
  },
  run({ args }) {
    const a = withParent(args);
    const json = wantsJson(a.json);
    return reporting(json, async () => {
      const refs = (args._ as string[] | undefined) ?? [];
      if (!refs.length) throw usageError("no deck given: liebstoeckel decks move <deck...> --to <path>");
      if (a.to === undefined) throw usageError('no target given: liebstoeckel decks move <deck...> --to <path> ("/" for the root)');
      const cl = await cloud(a);
      const [decks, folders] = await Promise.all([fetchDecks(cl), fetchFolders(cl)]);
      const picked = requireDecks(decks, refs);
      const target = requireFolder(folders, a.to);
      const result = await call<{ moved: number }>(cl, "POST", "/decks/move", "move failed", {
        deckIds: picked.map((d) => d.id),
        folderId: target?.id ?? null,
      }).catch((e) => {
        throw explainRefusal(e, decks);
      });
      const where = target ? target.path : "/";
      if (json) {
        console.log(JSON.stringify({ ok: true, moved: result.moved, folder: target?.path ?? null, folderId: target?.id ?? null, decks: picked.map((d) => d.id) }));
        return;
      }
      console.log(`\n✓ moved ${result.moved} deck${result.moved === 1 ? "" : "s"} to ${where === "/" ? "the root" : `"${where}"`}\n`);
    });
  },
});

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return /^y(es)?$/i.test((await rl.question(question)).trim());
  } finally {
    rl.close();
  }
}

const decksDeleteCommand = defineCommand({
  meta: { name: "delete", description: "delete decks (all or nothing; asks first unless --yes)" },
  args: {
    decks: { type: "positional", required: false, description: "deck ids or keys", valueHint: "deck..." },
    yes: { type: "boolean", description: "delete without asking" },
    ...LIBRARY_ARGS,
  },
  run({ args }) {
    const a = withParent(args);
    const json = wantsJson(a.json);
    return reporting(json, async () => {
      const refs = (args._ as string[] | undefined) ?? [];
      if (!refs.length) throw usageError("no deck given: liebstoeckel decks delete <deck...> [--yes]");
      const cl = await cloud(a);
      const decks = await fetchDecks(cl);
      const picked = requireDecks(decks, refs);
      if (!args.yes) {
        // Only a person at a terminal can answer; an agent or a pipe passes --yes.
        if (json || !process.stdin.isTTY) {
          throw new CliError(`deleting ${picked.length} deck${picked.length === 1 ? "" : "s"} needs confirmation`, {
            code: "confirmation_required",
            hint: "pass --yes to delete without asking",
            exit: 2,
            details: { decks: picked.map((d) => ({ id: d.id, title: d.title })) },
          });
        }
        console.error(`\n  about to delete ${picked.length} deck${picked.length === 1 ? "" : "s"}${cl.org ? ` in ${cl.org}` : ""}:`);
        for (const d of picked) console.error(`    ${d.title}  (${d.deckKey ?? d.id})`);
        console.error("  This cannot be undone. Their share and preview links stop working, and their live results go with them.");
        if (!(await confirm("  Delete? [y/N] "))) {
          console.error("  nothing deleted");
          return;
        }
      }
      const result = await call<{ deleted: number }>(cl, "POST", "/decks/delete", "delete failed", {
        deckIds: picked.map((d) => d.id),
      }).catch((e) => {
        throw explainRefusal(e, decks);
      });
      if (json) {
        console.log(JSON.stringify({ ok: true, deleted: result.deleted, decks: picked.map((d) => d.id) }));
        return;
      }
      console.log(`\n✓ deleted ${result.deleted} deck${result.deleted === 1 ? "" : "s"}\n`);
    });
  },
});

/** `liebstoeckel decks [list|move|delete]`. */
export const decksCommand = defineCommand({
  meta: { name: "decks", description: "list, move and delete your cloud decks, coming soon" },
  args: LIBRARY_ARGS,
  setup: keepParentArgs,
  subCommands: { list: decksListCommand, move: decksMoveCommand, delete: decksDeleteCommand },
  default: "list",
});

// ── folders ─────────────────────────────────────────────────────────────────

const foldersListCommand = defineCommand({
  meta: { name: "list", description: "list the org's folders as a tree" },
  args: LIBRARY_ARGS,
  run({ args }) {
    const a = withParent(args);
    const json = wantsJson(a.json);
    return reporting(json, async () => {
      const cl = await cloud(a);
      const folders = await fetchFolders(cl);
      if (json) {
        console.log(
          JSON.stringify({ org: cl.org ?? null, folders: folders.map((f) => ({ id: f.id, parentId: f.parentId, name: f.name, path: f.path })) }),
        );
        return;
      }
      if (!folders.length) {
        console.log(`\n  no folders${cl.org ? ` in ${cl.org}` : ""} yet, make one: liebstoeckel folders create "Sales/Q4"\n`);
        return;
      }
      console.log(`\n  folders${cl.org ? ` in ${cl.org}` : ""}:\n`);
      for (const line of folderTree(folders)) console.log(`   ${line}`);
      console.log();
    });
  },
});

const foldersCreateCommand = defineCommand({
  meta: { name: "create", description: "create a folder path, including missing parents" },
  args: { path: { type: "positional", required: false, description: 'folder path, e.g. "Sales/Q4"', valueHint: "path" }, ...LIBRARY_ARGS },
  run({ args }) {
    const a = withParent(args);
    const json = wantsJson(a.json);
    return reporting(json, async () => {
      const names = normalizePath(args.path ?? "").split("/").filter(Boolean);
      if (!names.length) throw usageError('no folder given: liebstoeckel folders create "Sales/Q4"');
      const cl = await cloud(a);
      const folders = await fetchFolders(cl);
      let parent: CloudFolder | null = null;
      let created = false;
      for (const name of names) {
        const existing = folders.find((f) => f.parentId === (parent?.id ?? null) && f.name.toLowerCase() === name.toLowerCase());
        if (existing) {
          parent = existing;
          continue;
        }
        const res: { folder: CloudFolder } = await call(cl, "POST", "/folders", "could not create the folder", { parentId: parent?.id ?? null, name });
        folders.push(res.folder);
        parent = res.folder;
        created = true;
      }
      const folder = parent!;
      if (json) {
        console.log(JSON.stringify({ ok: true, created, folder: { id: folder.id, path: folder.path } }));
        return;
      }
      console.log(created ? `\n✓ created "${folder.path}"\n` : `\n  "${folder.path}" already exists\n`);
    });
  },
});

const foldersRenameCommand = defineCommand({
  meta: { name: "rename", description: "rename a folder" },
  args: {
    path: { type: "positional", required: false, description: "folder path", valueHint: "path" },
    name: { type: "positional", required: false, description: "new name", valueHint: "name" },
    ...LIBRARY_ARGS,
  },
  run({ args }) {
    const a = withParent(args);
    const json = wantsJson(a.json);
    return reporting(json, async () => {
      if (!args.path || !args.name) throw usageError('usage: liebstoeckel folders rename <path> <new-name>, e.g. folders rename "Sales/Q4" "Q4 2026"');
      const cl = await cloud(a);
      const folder = requireFolder(await fetchFolders(cl), args.path);
      if (!folder) throw usageError("the root cannot be renamed");
      const res = await call<{ folder: CloudFolder }>(cl, "PATCH", `/folders/${encodeURIComponent(folder.id)}`, "could not rename the folder", {
        name: args.name,
      });
      if (json) {
        console.log(JSON.stringify({ ok: true, folder: { id: res.folder.id, path: res.folder.path } }));
        return;
      }
      console.log(`\n✓ renamed "${folder.path}" to "${res.folder.path}"\n`);
    });
  },
});

const foldersDeleteCommand = defineCommand({
  meta: { name: "delete", description: "delete a folder; its decks and subfolders move up (never deleted)" },
  args: {
    path: { type: "positional", required: false, description: "folder path", valueHint: "path" },
    to: { type: "string", description: 'where its content goes (default: its parent; "/" for the root)', valueHint: "path" },
    ...LIBRARY_ARGS,
  },
  run({ args }) {
    const a = withParent(args);
    const json = wantsJson(a.json);
    return reporting(json, async () => {
      if (!args.path) throw usageError("no folder given: liebstoeckel folders delete <path> [--to <path>]");
      const cl = await cloud(a);
      const folders = await fetchFolders(cl);
      const folder = requireFolder(folders, args.path);
      if (!folder) throw usageError("the root cannot be deleted");
      const target = a.to === undefined ? undefined : requireFolder(folders, a.to);
      const res = await call<{ movedDecks: number; movedFolders: number; target: { id: string | null; path: string | null } }>(
        cl,
        "DELETE",
        `/folders/${encodeURIComponent(folder.id)}`,
        "could not delete the folder",
        target === undefined ? {} : { target: target?.id ?? null },
      );
      if (json) {
        console.log(
          JSON.stringify({ ok: true, deleted: folder.path, movedDecks: res.movedDecks, movedFolders: res.movedFolders, to: res.target.path }),
        );
        return;
      }
      const moved: string[] = [];
      if (res.movedDecks) moved.push(`${res.movedDecks} deck${res.movedDecks === 1 ? "" : "s"}`);
      if (res.movedFolders) moved.push(`${res.movedFolders} folder${res.movedFolders === 1 ? "" : "s"}`);
      const where = res.target.path ? `"${res.target.path}"` : "the root";
      console.log(`\n✓ deleted "${folder.path}"${moved.length ? `; ${moved.join(" and ")} moved to ${where}` : ""}\n`);
    });
  },
});

/** `liebstoeckel folders [list|create|rename|delete]`. */
export const foldersCommand = defineCommand({
  meta: { name: "folders", description: "organize cloud decks in folders, coming soon" },
  args: LIBRARY_ARGS,
  setup: keepParentArgs,
  subCommands: { list: foldersListCommand, create: foldersCreateCommand, rename: foldersRenameCommand, delete: foldersDeleteCommand },
  default: "list",
});
