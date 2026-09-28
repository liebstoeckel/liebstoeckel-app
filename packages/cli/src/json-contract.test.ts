// The machine-output contract across the whole CLI: which commands have a JSON
// mode (the inventory), and that each one's stdout is exactly one JSON document,
// failures included, with the documented error shape and exit codes.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ArgsDef, CommandDef } from "citty";
import { rootCommand } from "./cli";

/** Every command, and whether it has a JSON mode. A string is the reason it has
 *  none; adding a command means adding it here, on purpose. */
const INVENTORY: Record<string, "json" | "always-json" | "explicit-json" | string> = {
  new: "writes files; prints the created paths as prose",
  add: "json",
  "registry list": "json",
  "registry view": "json",
  build: "json",
  eject: "writes files; prints the written paths as prose",
  pack: "json",
  licenses: "json",
  dev: "explicit-json", // a server: only the startup line, and only with --json
  "dev poll": "always-json", // agent loop, no human mode
  live: "long-running server",
  relay: "long-running server",
  thumbs: "writes image files",
  export: "writes image or PDF files",
  "skill install": "writes files",
  "skill update": "writes files",
  update: "its output is bun's (subprocesses)",
  doctor: "json",
  login: "interactive device sign-in",
  push: "json",
  pull: "json",
  "sync status": "json",
  "sync commit": "json",
  "orgs list": "json",
  "orgs use": "changes a setting",
  decks: "json",
  "brand list": "json",
  "brand push": "uploads a file",
  "brand pull": "writes files and runs bun add",
};

type AnyCommand = CommandDef<ArgsDef>;
const resolveValue = async <T,>(v: unknown): Promise<T> => (typeof v === "function" ? await (v as () => T)() : (v as T));

/** Every runnable command path with the options it declares. */
async function walk(cmd: AnyCommand, path: string[] = []): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  const args = (await resolveValue<Record<string, unknown> | undefined>(cmd.args)) ?? {};
  const subs = (await resolveValue<Record<string, unknown> | undefined>(cmd.subCommands)) ?? {};
  if (path.length > 0 && (cmd.run || Object.keys(subs).length === 0)) out.set(path.join(" "), args);
  for (const [name, sub] of Object.entries(subs)) {
    for (const [k, v] of await walk(await resolveValue<AnyCommand>(sub), [...path, name])) out.set(k, v);
  }
  return out;
}

describe("command inventory", () => {
  test("every command is in the inventory, and --json is declared exactly where it says", async () => {
    const commands = await walk(rootCommand as AnyCommand);
    expect([...commands.keys()].sort()).toEqual(Object.keys(INVENTORY).sort());
    for (const [path, args] of commands) {
      const entry = INVENTORY[path]!;
      const hasJsonFlag = "json" in args;
      const expected = entry === "json" || entry === "explicit-json";
      expect({ path, hasJsonFlag }).toEqual({ path, hasJsonFlag: expected });
    }
  });
});

// ── spawned runs ────────────────────────────────────────────────────────────

const CLI = join(import.meta.dir, "cli.ts");
let home: string;
let work: string;
let server: ReturnType<typeof Bun.serve> | undefined;

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

async function run(args: string[], opts: { cwd?: string; env?: Record<string, string> } = {}): Promise<Run> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !k.startsWith("LIEBSTOECKEL_")) env[k] = v;
  const proc = Bun.spawn([process.execPath, CLI, ...args], {
    cwd: opts.cwd ?? work,
    // A throwaway HOME: never the developer's real credentials, config or trust list.
    env: { ...env, HOME: home, USERPROFILE: home, LIEBSTOECKEL_NO_UPDATE_CHECK: "1", ...opts.env },
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { code, stdout, stderr };
}

/** stdout must be one JSON document and nothing else. */
function oneDoc(r: Run): any {
  const text = r.stdout.trim();
  expect(text.length, `stdout was empty; stderr: ${r.stderr}`).toBeGreaterThan(0);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`stdout is not exactly one JSON document:\n${r.stdout}\n--- stderr:\n${r.stderr}`);
  }
}

function expectError(r: Run, code: string, exit = 1): any {
  const doc = oneDoc(r);
  expect(doc).toMatchObject({ ok: false, code });
  expect(typeof doc.error).toBe("string");
  expect(r.code).toBe(exit);
  return doc;
}

function writeCreds(api: string) {
  const dir = join(home, ".config", "liebstoeckel");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "credentials.json"), JSON.stringify({ api, token: "test-token" }));
}

function clearCreds() {
  rmSync(join(home, ".config", "liebstoeckel", "credentials.json"), { force: true });
}

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "lst-json-home-"));
  work = mkdtempSync(join(tmpdir(), "lst-json-work-"));
});

afterAll(() => {
  server?.stop(true);
  rmSync(home, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

const T = 60_000;

describe("backend-free commands print one JSON document when piped", () => {
  test("registry list / view, and their failures", async () => {
    const list = await run(["registry", "list"]);
    const rows = oneDoc(list);
    expect(Array.isArray(rows)).toBe(true);
    expect(list.code).toBe(0);
    const view = await run(["registry", "view", rows[0].name]);
    expect(oneDoc(view).name).toBe(rows[0].name);
    expectError(await run(["registry", "view", "no-such-item"]), "not_found");
    expectError(await run(["registry", "view"]), "usage", 2);
  }, T);

  test("--no-json gives prose even when piped", async () => {
    const r = await run(["registry", "list", "--no-json"]);
    expect(r.code).toBe(0);
    expect(() => JSON.parse(r.stdout)).toThrow();
  }, T);

  test("doctor", async () => {
    const doc = oneDoc(await run(["doctor"], { env: { LIEBSTOECKEL_CHROMIUM: "/nonexistent/chromium" } }));
    expect(doc.bun.ok).toBe(true);
  }, T);

  test("add with nothing to add is a usage error", async () => {
    expectError(await run(["add"]), "usage", 2);
  }, T);

  test("pack lists the files, and refuses a non-deck", async () => {
    const deck = join(work, "pack-deck");
    mkdirSync(deck, { recursive: true });
    writeFileSync(join(deck, "index.html"), "<!doctype html><title>t</title>");
    writeFileSync(join(deck, "package.json"), JSON.stringify({ name: "pack-deck", version: "0.0.0", files: ["index.html"] }));
    const doc = oneDoc(await run(["pack", deck]));
    expect(doc.files).toContain("index.html");
    expect(doc.out).toBeNull();
    expectError(await run(["pack", work]), "not_a_deck");
  }, T);

  test("licenses on a built file without notices", async () => {
    const html = join(work, "plain.html");
    writeFileSync(html, "<!doctype html><title>x</title>");
    expectError(await run(["licenses", html]), "no_notices");
  }, T);

  test("an untrusted build is refused, and neither channel suggests the approval flag", async () => {
    const deck = join(work, "untrusted");
    mkdirSync(deck, { recursive: true });
    writeFileSync(join(deck, "index.html"), "<!doctype html>");
    const r = await run(["build", deck], { env: { LIEBSTOECKEL_TRUST_FILE: join(home, "trusted.json") } });
    const doc = expectError(r, "untrusted_deck");
    expect(JSON.stringify(doc)).not.toContain("--trust");
    expect(r.stderr).not.toContain("--trust");
  }, T);

  test("dev poll without a server reports on stdout", async () => {
    expectError(await run(["dev", "poll"]), "no_dev_server");
  }, T);
});

describe("unknown options", () => {
  test("refused with exit 2 and a suggestion, as JSON on a JSON command", async () => {
    const doc = expectError(await run(["decks", "--jsn"]), "unknown_option", 2);
    expect(doc.hint).toContain("--json");
  }, T);

  test("refused as prose on a command without a JSON mode", async () => {
    const r = await run(["new", "x", "--bogus"]);
    expect(r.code).toBe(2);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("--bogus");
  }, T);

  test("refused before any side effect: new writes nothing", async () => {
    await run(["new", "never-made", "--brnad", "x"]);
    expect(await Bun.file(join(work, "never-made", "package.json")).exists()).toBe(false);
  }, T);
});

describe("cloud commands", () => {
  test("without credentials: one not_logged_in document each", async () => {
    clearCreds();
    for (const cmd of [["decks"], ["orgs"], ["orgs", "list"], ["brand", "list"], ["push", join(work, "plain.html")]]) {
      const doc = expectError(await run(cmd), "not_logged_in");
      expect(doc.error).toBe("not logged in");
      expect(doc.hint).toContain("coming soon");
    }
    expectError(await run(["pull"]), "not_linked");
    expectError(await run(["sync", "status"]), "not_linked");
  }, T);

  test("against a control plane: decks, orgs, brands, push", async () => {
    let status = 200;
    server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(req) {
        if (status !== 200) return new Response("nope", { status });
        const { pathname } = new URL(req.url);
        if (req.method === "POST" && pathname === "/api/v1/decks") {
          return Response.json({ deck: { id: "d1", title: "Talk" }, version: 2, isNew: false });
        }
        if (pathname === "/api/v1/decks") {
          return Response.json({ decks: [{ id: "d1", title: "Talk", version: 2, shared: false, shareSlug: null, views: 3, uniqueViews: 2 }] });
        }
        if (pathname === "/api/v1/orgs") {
          return Response.json({
            active: { slug: "me", name: "Me", role: "owner", personal: true, plan: "free" },
            orgs: [{ slug: "me", name: "Me", personal: true }],
          });
        }
        if (pathname === "/api/v1/orgs/brands") return Response.json({ brands: [{ name: "acme", isDefault: true, tokens: {} }] });
        return new Response("not found", { status: 404 });
      },
    });
    writeCreds(`http://127.0.0.1:${server.port}`);

    const decks = oneDoc(await run(["decks", "--json"]));
    expect(decks).toEqual({ org: null, decks: [{ id: "d1", title: "Talk", version: 2, shared: false, shareSlug: null, views: 3, uniqueViews: 2 }] });
    const orgs = oneDoc(await run(["orgs"]));
    expect(orgs.default).toBeNull();
    expect(orgs.orgs[0].slug).toBe("me");
    expect(oneDoc(await run(["brand", "list"])).brands[0].name).toBe("acme");

    const html = join(work, "talk", "dist", "talk.html");
    mkdirSync(join(work, "talk", "dist"), { recursive: true });
    writeFileSync(html, "<!doctype html><title>Talk</title>");
    const push = await run(["push", html]);
    expect(oneDoc(push)).toMatchObject({ ok: true, deck: { id: "d1", title: "Talk" }, version: 2, isNew: false, key: "talk" });
    expect(push.stderr).toContain("pushed");

    status = 401;
    expectError(await run(["decks"]), "session_expired");
    status = 500;
    const failed = expectError(await run(["decks"]), "request_failed");
    expect(failed.error).not.toContain("test-token");
    clearCreds();
  }, T);
});
