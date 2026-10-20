// The `liebstoeckel` shim end to end, on a fake install: a package tree with the
// shim, a stand-in `@oven/bun-*` package whose "binary" is a script that records
// how it was called and runs the real Bun, and a `bun` first on PATH that fails
// loudly. POSIX only (the fake binary is a shell script); Windows is checked on a
// real machine.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PRIMARY } from "./resolve-bun.js";

const NODE = Bun.which("node");
const KEY = `${process.platform}-${process.arch}`;
const OVEN = (PRIMARY as Record<string, string>)[KEY];
const run = process.platform !== "win32" && NODE && OVEN && !process.env.LIEBSTOECKEL_SKIP_SHIM_TEST;

let root: string;
let cliDir: string;
let ovenDir: string;
let log: string;
let env: Record<string, string>;

const CLI_TS = `
const [cmd, arg] = process.argv.slice(2);
if (cmd === "exit") process.exit(Number(arg));
if (cmd === "wait") {
  let n = 0;
  for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => { n++; console.log("child got " + s + " " + n); setTimeout(() => process.exit(0), 200); });
  console.log("ready");
  setInterval(() => {}, 1000);
} else {
  console.log("args " + JSON.stringify(process.argv.slice(2)));
}
`;

function writePkg(version: string) {
  writeFileSync(
    join(cliDir, "package.json"),
    JSON.stringify({ name: "@liebstoeckel/cli", version: "0.0.0-test", type: "module", optionalDependencies: { [OVEN!]: version } }),
  );
}

beforeAll(() => {
  if (!run) return;
  root = mkdtempSync(join(tmpdir(), "lst-shim-"));
  cliDir = join(root, "node_modules", "@liebstoeckel", "cli");
  ovenDir = join(root, "node_modules", OVEN!);
  log = join(root, "calls.log");
  mkdirSync(join(cliDir, "bin"), { recursive: true });
  mkdirSync(join(cliDir, "src"), { recursive: true });
  for (const f of ["liebstoeckel.js", "resolve-bun.js"]) copyFileSync(join(import.meta.dir, f), join(cliDir, "bin", f));
  writeFileSync(join(cliDir, "src", "cli.ts"), CLI_TS);
  writePkg("9.9.9");
  mkdirSync(join(ovenDir, "bin"), { recursive: true });
  writeFileSync(join(ovenDir, "package.json"), JSON.stringify({ name: OVEN, version: "9.9.9" }));
  const fake = join(ovenDir, "bin", "bun");
  writeFileSync(fake, `#!/bin/sh\necho "pinned $@" >> "${log}"\nexec "${process.execPath}" "$@"\n`);
  chmodSync(fake, 0o755);
  // A `bun` first on PATH that must never run.
  const trap = join(root, "trap");
  mkdirSync(trap);
  writeFileSync(join(trap, "bun"), `#!/bin/sh\necho "SYSTEM BUN CALLED" >&2\necho system >> "${log}"\nexit 97\n`);
  chmodSync(join(trap, "bun"), 0o755);
  env = { ...(process.env as Record<string, string>), PATH: `${trap}:${process.env.PATH}` };
});

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

const shim = () => join(cliDir, "bin", "liebstoeckel.js");
const calls = () => {
  try {
    return readFileSync(log, "utf8");
  } catch {
    return "";
  }
};

describe.skipIf(!run)("liebstoeckel shim", () => {
  test("runs src/cli.ts on the pinned binary with the arguments, under Node and under Bun", () => {
    for (const runtime of [NODE!, process.execPath]) {
      const r = spawnSync(runtime, [shim(), "hello", "--flag", "a b"], { env, encoding: "utf8" });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain(`args ["hello","--flag","a b"]`);
    }
    expect(calls()).toContain(`pinned ${join(cliDir, "src", "cli.ts")} hello --flag a b`);
    expect(calls()).not.toContain("system");
  });

  test("passes the exit code through", () => {
    expect(spawnSync(NODE!, [shim(), "exit", "3"], { env }).status).toBe(3);
    expect(spawnSync(NODE!, [shim(), "exit", "0"], { env }).status).toBe(0);
  });

  test("Ctrl+C (SIGINT to the process group) reaches the child once; both exit", async () => {
    const child = spawn(NODE!, [shim(), "wait"], { env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout!.on("data", (d) => (out += d));
    const deadline = Date.now() + 10_000;
    while (!out.includes("ready") && Date.now() < deadline) await Bun.sleep(50);
    expect(out).toContain("ready");
    process.kill(-child.pid!, "SIGINT");
    const code = await new Promise<number | null>((res) => child.on("exit", (c) => res(c)));
    expect(code).toBe(0);
    expect(out.match(/child got SIGINT/g)?.length).toBe(1);
    // nothing is left in the group
    expect(() => process.kill(-child.pid!, 0)).toThrow();
  }, 20_000);

  test("SIGTERM to the shim alone is passed on", async () => {
    const child = spawn(NODE!, [shim(), "wait"], { env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout!.on("data", (d) => (out += d));
    const deadline = Date.now() + 10_000;
    while (!out.includes("ready") && Date.now() < deadline) await Bun.sleep(50);
    child.kill("SIGTERM");
    const code = await new Promise<number | null>((res) => child.on("exit", (c) => res(c)));
    expect(out).toContain("child got SIGTERM");
    expect(code).toBe(0);
  }, 20_000);

  test("a version mismatch and a missing package fail with the fix, as JSON under --json", () => {
    writePkg("9.9.8");
    try {
      const r = spawnSync(NODE!, [shim(), "build", "--json"], { env, encoding: "utf8" });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(`found ${OVEN}@9.9.9, but this CLI is pinned to Bun 9.9.8`);
      expect(JSON.parse(r.stdout)).toMatchObject({ ok: false, code: "bun_version_mismatch" });
    } finally {
      writePkg("9.9.9");
    }
    rmSync(join(ovenDir, "bin", "bun"));
    const gone = spawnSync(NODE!, [shim(), "build"], { env, encoding: "utf8" });
    expect(gone.status).toBe(1);
    expect(gone.stderr).toContain("its binary");
    rmSync(ovenDir, { recursive: true });
    const missing = spawnSync(NODE!, [shim(), "build"], { env, encoding: "utf8" });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain(`looked for ${OVEN}@9.9.9`);
    expect(missing.stdout).toBe("");
    expect(calls()).not.toContain("system");
  });
});

// The real shim from this checkout (its @oven/bun-* package is installed in the
// workspace): a hard kill of the shim must not leave the CLI running.
const REAL_SHIM = join(import.meta.dir, "liebstoeckel.js");
const DEMO = join(import.meta.dir, "..", "..", "..", "presentations", "demo");
describe.skipIf(!run)("real shim", () => {
  test("SIGKILL to the shim stops the dev server it started", async () => {
    const child = spawn(NODE!, [REAL_SHIM, "dev", "--dir", DEMO, "--port", "0", "--json"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout!.on("data", (d) => (out += d));
    child.stderr!.on("data", (d) => (out += d));
    const deadline = Date.now() + 60_000;
    while (!/"port":\d+/.test(out) && Date.now() < deadline) await Bun.sleep(100);
    expect(out).toMatch(/"port":\d+/);
    const port = Number(/"port":(\d+)/.exec(out)![1]);
    child.kill("SIGKILL");
    const gone = Date.now() + 5_000;
    let up = true;
    while (up && Date.now() < gone) {
      await Bun.sleep(250);
      up = await fetch(`http://127.0.0.1:${port}/__dev/ping`).then(() => true, () => false);
    }
    expect(up).toBe(false);
  }, 90_000);
});
