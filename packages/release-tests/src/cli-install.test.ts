// Registry-install e2e tier: install the *published* @liebstoeckel/cli from a
// real registry (Verdaccio in CI) into a clean sandbox outside the monorepo, then
// walk the whole OFFLINE usage surface a new user would hit: --help, new,
// install, build --check, build, registry list/view, add, pack, eject, skill
// install/update, live, plus the agent contract (cloud commands say "coming
// soon", piped runs carry no update reminder). This is what `--help` smoke cannot
// catch: undeclared/phantom deps and broken cross-dep closures in the published
// packages.
//
// Gated on LIEBSTOECKEL_E2E_REGISTRY so the suite self-skips in the unit-test
// tier (`bun test packages`). Run it like:
//
//   LIEBSTOECKEL_E2E_REGISTRY=http://127.0.0.1:4873/ \
//     bun test packages/release-tests/src/cli-install.test.ts
//
// Optional env:
//   LIEBSTOECKEL_E2E_CLI_SPEC   version or dist-tag to install (default: latest)
//   LIEBSTOECKEL_E2E_NPM_TOKEN  auth token for the @liebstoeckel scope
//   LIEBSTOECKEL_CHROMIUM       browser binary; enables the thumbnail/export tests
//
// The release matrix (.github/workflows/os-matrix.yml) runs it on Linux, Windows and
// macOS against a local registry holding the tarballs of the commit under test.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { $ } from "bun";

const REGISTRY = process.env.LIEBSTOECKEL_E2E_REGISTRY?.replace(/\/*$/, "/");
const TOKEN = process.env.LIEBSTOECKEL_E2E_NPM_TOKEN;
const CHROMIUM = process.env.LIEBSTOECKEL_CHROMIUM;
const BUN = process.execPath;
const SPEC = process.env.LIEBSTOECKEL_E2E_CLI_SPEC || "latest";

const MIN = 60_000;
const WINDOWS = process.platform === "win32";

// The hosted service is not generally available, so every cloud command must
// label itself "coming soon" rather than fail like a bug.
const CLOUD_COMMANDS = ["login", "push", "orgs", "decks", "brand"];
// Newer cloud commands: asserted only when the installed CLI already lists them.
const OPTIONAL_CLOUD_COMMANDS = ["pull", "sync"];
// Where `skill install` puts the Claude copy of the skill inside a deck.
const CLAUDE_SKILL = join(".claude", "skills", "liebstoeckel-deck", "SKILL.md");

/** Scope-mapped .npmrc: @liebstoeckel from the registry under test, everything
 *  else from the default (npmjs) — the same shape the publish task writes. */
function npmrc(reg: string): string {
  const hostPath = reg.replace(/^https?:\/\//, "");
  const lines = [`@liebstoeckel:registry=${reg}`];
  if (TOKEN) lines.push(`//${hostPath}:_authToken=${TOKEN}`, "always-auth=true");
  return lines.join("\n") + "\n";
}

/** Fail with the child's output attached, so a red CI run is diagnosable. */
function expectOk(r: $.ShellOutput, what: string): void {
  if (r.exitCode !== 0) {
    throw new Error(`${what} failed (exit ${r.exitCode})\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  }
}

/** The `version:` stamped into an installed SKILL.md. */
async function skillVersion(file: string): Promise<string | undefined> {
  return /\n\s*version:\s*(\S+)/.exec(await Bun.file(file).text())?.[1];
}

/** Rewrite the stamped `version:` of an installed SKILL.md. */
async function stampSkill(file: string, version: string): Promise<void> {
  const text = await Bun.file(file).text();
  await Bun.write(file, text.replace(/(\n\s*version:\s*)\S+/, `$1${version}`));
}

/** Stop a server the test started and what it started: the launcher runs the CLI on
 *  its pinned Bun as a child, and on Windows killing a process leaves its children. */
async function stopTree(proc: { pid: number; kill: () => void; exited: Promise<number> }): Promise<void> {
  if (WINDOWS) Bun.spawnSync(["taskkill", "/pid", String(proc.pid), "/T", "/F"], { stdout: "ignore", stderr: "ignore" });
  else proc.kill();
  await proc.exited;
}

async function waitForHttp(url: string, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return res.text();
      last = new Error(`status ${res.status}`);
    } catch (e) {
      last = e;
    }
    await Bun.sleep(500);
  }
  throw new Error(`timed out waiting for ${url}: ${last}`);
}

describe.skipIf(!REGISTRY)("installed CLI, offline surface (registry e2e)", () => {
  let sandbox: string; // acts as $HOME and workdir; nothing leaks into the real one
  let deck: string;
  let bin: string;
  let env: Record<string, string>;
  let registryItem: string; // first catalog item, used by the `add` test
  let cliVersion: string; // the installed @liebstoeckel/cli version
  let trapLog: string; // what the `bun` on PATH recorded: it must stay empty

  beforeAll(async () => {
    sandbox = mkdtempSync(join(tmpdir(), "lst-install-"));
    deck = join(sandbox, "testdeck");
    // The package's own entry, run by the Bun under test: on Windows node_modules/.bin
    // holds Bun's .exe shims, not this file.
    bin = join(sandbox, "node_modules", "@liebstoeckel", "cli", "bin", "liebstoeckel.js");
    // Children get a clean HOME (no dev credentials/config) and no ambient
    // LIEBSTOECKEL_* config except the explicit Chromium override.
    env = {};
    let pathKey = "PATH"; // Windows spells it Path, and its environment ignores case
    for (const [k, v] of Object.entries(process.env)) {
      if (v == null || k === "HOME" || k === "XDG_CONFIG_HOME" || k.startsWith("LIEBSTOECKEL_")) continue;
      if (k.toUpperCase() === "PATH") pathKey = k;
      env[k] = v;
    }
    // Windows keeps the real USERPROFILE: Chrome there does not start for export
    // under a profile folder without its AppData.
    env.HOME = sandbox;
    env.BUN_RUNTIME_TRANSPILER_CACHE_PATH = "0";
    // The installed command runs on its own pinned Bun, so a `bun` first on PATH
    // is never started; this one fails loudly and leaves a trace if it is.
    const trap = join(sandbox, ".trap-bin");
    trapLog = join(sandbox, "trap.log");
    mkdirSync(trap);
    await Bun.write(join(trap, "bun"), `#!/bin/sh\necho "bun $*" >> "${trapLog}"\necho "the system bun was called" >&2\nexit 97\n`);
    await Bun.write(join(trap, "bunx"), `#!/bin/sh\necho "bunx $*" >> "${trapLog}"\nexit 97\n`);
    if (WINDOWS) {
      // What cmd.exe and a PATH lookup find on Windows.
      await Bun.write(join(trap, "bun.cmd"), `@echo bun %* >> "${trapLog}"\r\n@echo the system bun was called 1>&2\r\n@exit /b 97\r\n`);
      await Bun.write(join(trap, "bunx.cmd"), `@echo bunx %* >> "${trapLog}"\r\n@exit /b 97\r\n`);
    } else {
      await $`chmod +x ${join(trap, "bun")} ${join(trap, "bunx")}`.quiet();
    }
    env[pathKey] = `${trap}${delimiter}${env[pathKey] ?? ""}`;
    if (CHROMIUM) env.LIEBSTOECKEL_CHROMIUM = CHROMIUM;

    await Bun.write(join(sandbox, ".npmrc"), npmrc(REGISTRY!));
    await Bun.write(join(sandbox, "package.json"), JSON.stringify({ name: "cli-install-e2e", private: true }));
  });

  afterAll(() => {
    // On Windows a server child the test stopped may still hold a file for a moment.
    if (sandbox) rmSync(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }, MIN);

  test(`installs @liebstoeckel/cli@${SPEC} from the registry`, async () => {
    const r = await $`${BUN} add @liebstoeckel/cli@${SPEC}`.cwd(sandbox).env(env).quiet().nothrow();
    expectOk(r, "bun add @liebstoeckel/cli");
    expect(existsSync(bin)).toBe(true);
    const binDir = join(sandbox, "node_modules", ".bin");
    for (const name of ["liebstoeckel", "lst"]) {
      // the short alias ships too; Bun links bins as .exe (and .bunx) on Windows
      expect([name, `${name}.exe`].some((f) => existsSync(join(binDir, f))), `node_modules/.bin/${name}`).toBe(true);
    }
    const pkg = join(sandbox, "node_modules", "@liebstoeckel", "cli", "package.json");
    cliVersion = ((await Bun.file(pkg).json()) as { version: string }).version;
    console.log(`installed @liebstoeckel/cli ${cliVersion}`);
  }, 5 * MIN);

  test("the command runs on the CLI's pinned Bun, not the one running it", async () => {
    const r = await $`${BUN} ${bin} --version`.cwd(sandbox).env(env).quiet().nothrow();
    expectOk(r, "liebstoeckel --version");
    const [first, bunLine, esbuildLine] = r.stdout.toString().trim().split("\n");
    expect(first).toBe(`liebstoeckel ${cliVersion}`);
    expect(bunLine).toMatch(/^bun \d+\.\d+\.\d+ \(pinned, @oven\/bun-[a-z0-9-]+\)$/);
    expect(esbuildLine).toMatch(/^esbuild \d+\.\d+\.\d+ \(@esbuild\/[a-z0-9-]+\)$/);
  }, MIN);

  test("--help lists the command surface", async () => {
    const r = await $`${BUN} ${bin} --help`.cwd(sandbox).env(env).quiet().nothrow();
    expectOk(r, "liebstoeckel --help");
    const help = r.stdout.toString();
    // citty renders a COMMANDS table; each subcommand name appears as its own entry.
    expect(help).toContain("COMMANDS");
    for (const cmd of ["new", "add", "registry", "build", "eject", "pack", "dev", "live", "export", "skill"]) {
      expect(help).toMatch(new RegExp(`\\b${cmd}\\b`));
    }
  }, MIN);

  test("cloud commands are labeled coming soon", async () => {
    const root = await $`${BUN} ${bin} --help`.cwd(sandbox).env(env).quiet().nothrow();
    expectOk(root, "liebstoeckel --help");
    // Strip ANSI styling: citty colors the command names when FORCE_COLOR is set.
    const lines = root.stdout.toString().replace(/\x1b\[[0-9;]*m/g, "").split("\n");
    const listed = (cmd: string) => lines.find((l) => new RegExp(`^\\s*${cmd}\\s`).test(l));
    const present = OPTIONAL_CLOUD_COMMANDS.filter((cmd) => listed(cmd));
    for (const cmd of [...CLOUD_COMMANDS, ...present]) {
      expect(listed(cmd), `root --help lists ${cmd}`).toBeDefined();
      expect(listed(cmd)!, `root --help entry for ${cmd}`).toContain("coming soon");
      const own = await $`${BUN} ${bin} ${cmd} --help`.cwd(sandbox).env(env).quiet().nothrow();
      expectOk(own, `liebstoeckel ${cmd} --help`);
      expect(own.stdout.toString(), `${cmd} --help`).toContain("coming soon");
    }
  }, 2 * MIN);

  test("a cloud command without credentials exits 1 with the coming-soon notice", async () => {
    // The sandbox HOME holds no credentials. Piped stdout is the agent path: the
    // failure arrives as JSON on stdout.
    const r = await $`${BUN} ${bin} decks`.cwd(sandbox).env(env).quiet().nothrow();
    expect(r.exitCode).toBe(1);
    const res = JSON.parse(r.stdout.toString()) as { error: string; hint: string };
    expect(res.error).toBe("not logged in");
    expect(res.hint).toContain("coming soon");
  }, MIN);

  test("new scaffolds a deck", async () => {
    // `new` installs the deck's dependencies itself, with the pinned Bun (the
    // sandbox HOME's .npmrc maps the scope to the registry under test).
    const r = await $`${BUN} ${bin} new testdeck --no-org-brand`.cwd(sandbox).env(env).quiet().nothrow();
    expectOk(r, "liebstoeckel new");
    for (const f of ["package.json", "index.html", "main.tsx"]) {
      expect(existsSync(join(deck, f))).toBe(true);
    }
    // The CLI builds and serves the deck: no build or server script of its own.
    for (const f of ["server.ts", "build.ts", "bunfig.toml"]) expect(existsSync(join(deck, f))).toBe(false);
    expect(readdirSync(join(deck, "slides")).length).toBeGreaterThan(0);
    expect(existsSync(join(deck, "node_modules", "@liebstoeckel", "engine"))).toBe(true);
    await Bun.write(join(deck, ".npmrc"), npmrc(REGISTRY!));
  }, 5 * MIN);

  test("install reinstalls the deck's dependencies and adds packages", async () => {
    rmSync(join(deck, "node_modules"), { recursive: true, force: true });
    const r = await $`${BUN} ${bin} install --json`.cwd(deck).env(env).quiet().nothrow();
    expectOk(r, "liebstoeckel install");
    expect(JSON.parse(r.stdout.toString())).toMatchObject({ ok: true, action: "install", packages: [] });
    expect(existsSync(join(deck, "node_modules", "@liebstoeckel", "engine"))).toBe(true);
    const add = await $`${BUN} ${bin} install @liebstoeckel/plugin-poll --dir testdeck --json`.cwd(sandbox).env(env).quiet().nothrow();
    expectOk(add, "liebstoeckel install <package>");
    const pkg = (await Bun.file(join(deck, "package.json")).json()) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["@liebstoeckel/plugin-poll"]).toBeDefined();
  }, 5 * MIN);

  test("build --check validates the deck (the agent contract)", async () => {
    const r = await $`${BUN} ${bin} build --check --json`.cwd(deck).env(env).quiet().nothrow();
    expectOk(r, "build --check");
    const { ok, diagnostics } = JSON.parse(r.stdout.toString()) as { ok: boolean; diagnostics: unknown[] };
    // ok + empty diagnostics also gates the single-copy guard on a REAL
    // published closure: caret cross-deps must resolve one copy of each @liebstoeckel
    // package — a duplicate would surface here as a conflict diagnostic + ok:false.
    expect(diagnostics).toEqual([]);
    expect(ok).toBe(true);
  }, 3 * MIN);

  test("build produces one self-contained HTML", async () => {
    const r = await $`${BUN} ${bin} build`.cwd(deck).env(env).quiet().nothrow();
    expectOk(r, "liebstoeckel build");
    const out = join(deck, "dist", "testdeck.html");
    expect(existsSync(out)).toBe(true);
    const html = await Bun.file(out).text();
    expect(html.length).toBeGreaterThan(100_000);
    expect(html.toLowerCase()).toStartWith("<!doctype html>");
    expect(html).toContain("<script");
    // With a browser available the build also embeds slide thumbnails.
    if (CHROMIUM) expect(html).toContain("data:image/");
  }, 5 * MIN);

  test("registry list/view answer in JSON", async () => {
    const list = await $`${BUN} ${bin} registry list --json`.cwd(sandbox).env(env).quiet().nothrow();
    expectOk(list, "registry list");
    const rows = JSON.parse(list.stdout.toString()) as Array<{ name: string; type: string }>;
    expect(rows.length).toBeGreaterThan(0);
    registryItem = rows[0]!.name;

    const view = await $`${BUN} ${bin} registry view ${registryItem} --json`.cwd(sandbox).env(env).quiet().nothrow();
    expectOk(view, "registry view");
    const item = JSON.parse(view.stdout.toString()) as { name: string; files: unknown[] };
    expect(item.name).toBe(registryItem);
    expect(item.files.length).toBeGreaterThan(0);
  }, MIN);

  test("add scaffolds a registry item into the deck", async () => {
    const r = await $`${BUN} ${bin} add ${registryItem} --dir testdeck --json`.cwd(sandbox).env(env).quiet().nothrow();
    expectOk(r, `add ${registryItem}`);
    const res = JSON.parse(r.stdout.toString()) as { action: string; wrote: string[]; skipped: string[] };
    expect(res.action).toBe("add");
    expect(res.wrote.length + res.skipped.length).toBeGreaterThan(0);
    for (const f of res.wrote) expect(existsSync(join(deck, f))).toBe(true);
  }, 5 * MIN);

  test("pack emits the source tarball a build embeds", async () => {
    const tgz = join(sandbox, "deck.tgz");
    const r = await $`${BUN} ${bin} pack --dir testdeck -o ${tgz}`.cwd(sandbox).env(env).quiet().nothrow();
    expectOk(r, "liebstoeckel pack");
    expect(r.stdout.toString()).toContain("index.html");
    expect(existsSync(tgz)).toBe(true);
  }, MIN);

  test("eject recovers editable source from the built HTML", async () => {
    const out = join(sandbox, "ejected");
    const r = await $`${BUN} ${bin} eject ${join(deck, "dist", "testdeck.html")} ${out}`.cwd(sandbox).env(env).quiet().nothrow();
    expectOk(r, "liebstoeckel eject");
    for (const f of ["package.json", "index.html", "main.tsx"]) {
      expect(existsSync(join(out, f))).toBe(true);
    }
  }, MIN);

  test("skill install materializes the agent skill", async () => {
    const r = await $`${BUN} ${bin} skill install --dir testdeck`.cwd(sandbox).env(env).quiet().nothrow();
    expectOk(r, "skill install");
    expect(existsSync(join(deck, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(deck, ".claude", "skills"))).toBe(true);
    expect(await skillVersion(join(deck, CLAUDE_SKILL))).toBe(cliVersion);
  }, MIN);

  test("skill update re-stamps the installed skill and adds no agent paths", async () => {
    // Drop one agent's copy: update refreshes what is installed and must not
    // bring it back (adding agent paths is `install`'s job).
    rmSync(join(deck, ".gemini"), { recursive: true, force: true });
    const before = readdirSync(deck).filter((f) => f.startsWith(".")).sort();
    // A version the self-heal leaves alone (not older than the CLI), so the
    // re-stamp below can only come from `skill update` itself.
    await stampSkill(join(deck, CLAUDE_SKILL), "99.0.0");

    const r = await $`${BUN} ${bin} skill update --dir testdeck`.cwd(sandbox).env(env).quiet().nothrow();
    expectOk(r, "skill update");
    expect(r.stdout.toString()).toContain("updated");
    expect(await skillVersion(join(deck, CLAUDE_SKILL))).toBe(cliVersion);
    expect(readdirSync(deck).filter((f) => f.startsWith(".")).sort()).toEqual(before);
    expect(existsSync(join(deck, ".gemini"))).toBe(false);
  }, MIN);

  test("piped runs print no update reminder, even with a stale cache and a stale skill", async () => {
    // A cached registry answer far ahead of the installed CLI, checked just now
    // (so no background refresh either), plus a deck skill from an old release.
    const configDir = join(sandbox, ".config", "liebstoeckel");
    mkdirSync(configDir, { recursive: true });
    await Bun.write(join(configDir, "update-check.json"), JSON.stringify({ checkedAt: Date.now(), latest: "99.0.0" }));
    await stampSkill(join(deck, CLAUDE_SKILL), "0.0.1");
    // Without CI in the env, only the non-TTY stderr gates the reminder.
    const { CI: _ci, ...piped } = env;

    for (const args of [["registry", "list", "--json"], ["registry", "list"]]) {
      const r = await $`${BUN} ${bin} ${args}`.cwd(deck).env(piped).quiet().nothrow();
      expectOk(r, `liebstoeckel ${args.join(" ")}`);
      const stderr = r.stderr.toString();
      expect(stderr).not.toContain("is available");
      expect(stderr).not.toContain("99.0.0");
      if (args.includes("--json")) expect(() => JSON.parse(r.stdout.toString())).not.toThrow();
    }
    // The stale skill is healed instead of nagged about: rewritten in place, with
    // its one-line notice on stderr only.
    expect(await skillVersion(join(deck, CLAUDE_SKILL))).toBe(cliVersion);
  }, MIN);

  test("live serves the deck over HTTP", async () => {
    const port = 43000 + (process.pid % 1000);
    const proc = Bun.spawn([BUN, bin, "live", "testdeck", "--port", String(port), "--no-thumbnails"], {
      cwd: sandbox,
      env,
      stdout: "pipe",
      stderr: "pipe",
    });
    let out = "";
    const drain = (async () => {
      for await (const chunk of proc.stdout) out += new TextDecoder().decode(chunk);
    })();
    try {
      // The server prints token-gated presenter/viewer links (a bare `/` is 403).
      const deadline = Date.now() + 2 * MIN;
      let link: string | undefined;
      while (!link && Date.now() < deadline) {
        link = out.match(/http:\/\/\S+\?t=[\w-]+/)?.[0];
        if (!link) await Bun.sleep(500);
      }
      if (!link) throw new Error(`live printed no session link; output so far:\n${out}`);
      const page = await waitForHttp(link.replace(/(localhost|\d+\.\d+\.\d+\.\d+)/, "127.0.0.1"), MIN);
      expect(page).toContain("<script");
    } finally {
      await stopTree(proc);
      await drain.catch(() => {});
    }
  }, 3 * MIN);

  test("dev boots the shell and the deck route", async () => {
    const port = 44000 + (process.pid % 1000);
    // cwd is the deck itself: with --dir the CLI re-execs a child with that
    // cwd, and killing only the parent would leave the server running.
    const proc = Bun.spawn([BUN, bin, "dev", "--port", String(port), "--json"], {
      cwd: deck,
      env,
      stdout: "pipe",
      stderr: "pipe",
    });
    let out = "";
    const drain = (async () => {
      for await (const chunk of proc.stdout) out += new TextDecoder().decode(chunk);
    })();
    try {
      const deadline = Date.now() + 2 * MIN;
      let info: { url?: string } | undefined;
      while (!info && Date.now() < deadline) {
        const line = out.split("\n").find((l) => l.startsWith("{"));
        if (line) info = JSON.parse(line);
        else await Bun.sleep(500);
      }
      if (!info?.url) throw new Error(`dev printed no JSON startup line; output so far:\n${out}`);
      const base = info.url.replace(/(localhost|\d+\.\d+\.\d+\.\d+)/, "127.0.0.1");
      const ping = await waitForHttp(`${base}/__dev/ping`, MIN);
      expect(JSON.parse(ping)).toEqual({ ok: true });
      // The plain deck lives at a token-keyed route; /deck redirects there.
      const redirect = await fetch(`${base}/deck`, { redirect: "manual" });
      expect(redirect.status).toBe(302);
      expect(redirect.headers.get("location")).toMatch(/^\/deck\/[\w-]+\/$/);
      // The shell document carries the sidebar bundle built from the installed package.
      const shell = await waitForHttp(`${base}/`, MIN);
      expect(shell).toContain("/__dev/shell.js");
      const shellJs = await fetch(`${base}/__dev/shell.js`);
      expect(shellJs.status).toBe(200);
    } finally {
      await stopTree(proc);
      await drain.catch(() => {});
    }
  }, 3 * MIN);

  test.skipIf(!CHROMIUM)("export renders slides to PNG", async () => {
    const out = join(sandbox, "png");
    const r = await $`${BUN} ${bin} export ${join(deck, "dist", "testdeck.html")} --format png --slides 1 -o ${out}`
      .cwd(sandbox)
      .env(env)
      .quiet()
      .nothrow();
    expectOk(r, "liebstoeckel export");
    const pngs = readdirSync(out).filter((f) => f.endsWith(".png"));
    expect(pngs.length).toBe(1);
  }, 3 * MIN);

  // `update` moves to the registry's latest, which a prerelease under test is not.
  test.skipIf(SPEC !== "latest")("update runs on the pinned Bun", async () => {
    const r = await $`${BUN} ${bin} update`.cwd(deck).env(env).quiet().nothrow();
    expectOk(r, "liebstoeckel update");
  }, 5 * MIN);

  test("no command started the bun on PATH", async () => {
    expect(existsSync(trapLog) ? await Bun.file(trapLog).text() : "").toBe("");
  });
});
