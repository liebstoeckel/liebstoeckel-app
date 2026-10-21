// One way of getting the CLI, checked the way a user meets it: `--version` and
// `doctor` must name the CLI's own pinned Bun (never the one on PATH, also when a
// real Bun runs the launcher), and with --build `new` plus `build` must give the
// scaffold's bytes (recorded as `scaffold <variant> <sha256>` in hashes.txt).
//   node variant.mjs <npx|pnpm-dlx|pnpm-add-g|npm-x64|bunx|bun-add-g> [--build]
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WINDOWS, must, run } from "./lib.mjs";

const [variant, ...flags] = process.argv.slice(2);
const version = process.env.CLI_VERSION;
const out = process.env.RELEASE_OUT;
const temp = process.env.RUNNER_TEMP;
if (!variant || !version || !out || !temp) {
  console.error("usage: variant.mjs <variant> [--build] (with CLI_VERSION, RELEASE_OUT and RUNNER_TEMP set)");
  process.exit(2);
}
const spec = `@liebstoeckel/cli@${version}`;
const env = { ...process.env };
const work = mkdtempSync(join(temp, `variant-${variant}-`));

/** The command that runs the CLI this way, after whatever install it needs. */
function command() {
  switch (variant) {
    case "npx":
      return ["npx", "-y", spec];
    case "pnpm-dlx":
      // The package has two commands (liebstoeckel and lst), so dlx needs one named.
      return ["pnpm", `--package=${spec}`, "dlx", "liebstoeckel"];
    case "pnpm-add-g": {
      const home = join(temp, "pnpm-home");
      mkdirSync(home, { recursive: true });
      env.PNPM_HOME = home;
      const pathKey = Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
      env[pathKey] = `${home}${WINDOWS ? ";" : ":"}${env[pathKey]}`;
      must("pnpm", ["add", "-g", spec], { env });
      return [join(home, WINDOWS ? "liebstoeckel.cmd" : "liebstoeckel")];
    }
    case "npm-x64": {
      // x64 Node on an Apple Silicon Mac runs under Rosetta; npm then installs the
      // darwin-x64 Bun, which has to start there too.
      if (process.arch !== "x64") throw new Error(`node runs as ${process.arch}, not x64`);
      const prefix = join(temp, "npm-x64-prefix");
      must("npm", ["i", "-g", "--prefix", prefix, spec], { env });
      return [join(prefix, "bin", "liebstoeckel")];
    }
    case "bunx":
      must("bun", ["--version"], { env });
      return ["bunx", spec];
    case "bun-add-g": {
      must("bun", ["add", "-g", spec], { env });
      const bin = must("bun", ["pm", "bin", "-g"], { env, stdio: ["ignore", "pipe", "inherit"] }).stdout.trim();
      return [join(bin, WINDOWS ? "liebstoeckel.exe" : "liebstoeckel")];
    }
    default:
      console.error(`unknown variant ${variant}`);
      process.exit(2);
  }
}

const [cmd, ...pre] = command();
const cli = (args, opts = {}) => run(cmd, [...pre, ...args], { env, cwd: work, ...opts });
const problems = [];

const v = cli(["--version"], { stdio: ["ignore", "pipe", "inherit"] });
console.log(v.stdout);
if (v.status !== 0) problems.push(`--version exited ${v.status}`);
else if (!/^bun \S+ \(pinned, @oven\/bun-[a-z0-9-]+\)$/m.test(v.stdout)) problems.push(`--version names no pinned Bun:\n${v.stdout}`);
else if (variant === "npm-x64" && !/\(pinned, @oven\/bun-darwin-x64\)/.test(v.stdout)) problems.push(`--version names no darwin-x64 Bun:\n${v.stdout}`);

const d = cli(["doctor", "--json"], { stdio: ["ignore", "pipe", "inherit"] });
try {
  const doc = JSON.parse(d.stdout);
  if (doc.bun?.source !== "pinned") problems.push(`doctor: bun.source is ${doc.bun?.source}, path ${doc.bun?.path}`);
  else console.log(`doctor: bun ${doc.bun.version} pinned at ${doc.bun.path}`);
} catch {
  problems.push(`doctor --json exited ${d.status} with no JSON:\n${d.stdout}`);
}

if (flags.includes("--build")) {
  const n = cli(["new", "osdeck", "--no-org-brand"]);
  if (n.status !== 0) problems.push(`new exited ${n.status}`);
  else {
    const deck = join(work, "osdeck");
    const b = run(cmd, [...pre, "build"], { env: { ...env, LIEBSTOECKEL_NO_THUMBS: "1" }, cwd: deck });
    if (b.status !== 0) problems.push(`build exited ${b.status}`);
    else {
      const hash = createHash("sha256").update(readFileSync(join(deck, "dist", "osdeck.html"))).digest("hex");
      appendFileSync(join(out, "hashes.txt"), `scaffold ${variant} ${hash}\n`);
      console.log(`scaffold ${variant} ${hash}`);
    }
  }
}

const checks = ["--version", "doctor", ...(flags.includes("--build") ? ["new", "build"] : [])];
const failedCheck = (c) => problems.some((p) => p.startsWith(c));
writeFileSync(
  join(out, `report-variant-${variant}.json`),
  JSON.stringify({ ok: problems.length === 0, results: checks.map((c) => ({ check: `${variant} ${c}`, ok: !failedCheck(c) })), problems }, null, 2) + "\n",
);
for (const p of problems) console.error(`${variant}: ${p}`);
process.exit(problems.length ? 1 : 0);
