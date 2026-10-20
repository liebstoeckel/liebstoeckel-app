#!/usr/bin/env node
// The `liebstoeckel` (and `lst`) command: start the CLI on its own pinned Bun.
//
// This file runs under Node or under any Bun and does one thing: find the Bun
// binary installed with this package (Oven's `@oven/bun-<platform>` package at
// the exact version in package.json) and run `src/cli.ts` on it, with stdio,
// the exit code and signals passed through. It never runs the `bun` on PATH,
// also not when it is itself running under Bun (`bunx`).
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  binaryIn,
  bunCandidates,
  bunProblem,
  installKind,
  pinnedVersion,
  problemJson,
  problemText,
  spawnProblem,
  wantsJson,
} from "./resolve-bun.js";

const pkgDir = dirname(dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);

/** Report a problem the way the CLI would and exit 1. */
function fail(problem) {
  process.stderr.write(problemText(problem));
  if (wantsJson(argv)) process.stdout.write(problemJson(problem) + "\n");
  process.exit(1);
}

/** musl libc (Alpine and similar), where the default glibc build cannot start.
 *  File probes only: they are instant, unlike `process.report`. */
function isMusl() {
  if (process.platform !== "linux") return false;
  if (existsSync("/etc/alpine-release")) return true;
  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
  const glibcLoader = process.arch === "arm64" ? "/lib/ld-linux-aarch64.so.1" : "/lib64/ld-linux-x86-64.so.2";
  return existsSync(`/lib/ld-musl-${arch}.so.1`) && !existsSync(glibcLoader);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

const version = pinnedVersion(readJson(join(pkgDir, "package.json")));
const musl = isMusl();
const { candidates, needs } = bunCandidates({ platform: process.platform, arch: process.arch, musl });
const require = createRequire(import.meta.url);

let bin = null;
let found = null;
let empty = null;
if (version) {
  for (const name of candidates) {
    let dir;
    try {
      dir = dirname(require.resolve(`${name}/package.json`));
    } catch {
      continue;
    }
    const installed = readJson(join(dir, "package.json")).version;
    const candidate = binaryIn(dir, process.platform);
    if (installed !== version) {
      found ??= { pkg: name, version: installed };
      continue;
    }
    if (existsSync(candidate)) {
      bin = candidate;
      break;
    }
    empty ??= candidate;
  }
}

if (!bin) {
  fail(
    bunProblem({
      platform: process.platform,
      arch: process.arch,
      musl,
      version,
      tried: candidates,
      needs,
      kind: installKind(pkgDir, process.env),
      found,
      empty,
    }),
  );
}

// The child watches this process and stops when it is gone: on Windows a hard kill
// (TerminateProcess, what most tools do to stop a process) cannot be caught here.
const child = spawn(bin, [join(pkgDir, "src", "cli.ts"), ...argv], {
  stdio: "inherit",
  env: { ...process.env, LIEBSTOECKEL_SHIM_PID: String(process.pid) },
});

const running = () => child.exitCode === null && child.signalCode === null;
if (process.platform === "win32") {
  // Ctrl+C and Ctrl+Break reach every process on the console, the child too.
  // Stay alive until the child has shut down, then exit with its code.
  process.on("SIGINT", () => {});
  process.on("SIGBREAK", () => {});
} else {
  // A terminal's Ctrl+C reaches the whole foreground process group, the child
  // included, so it is not forwarded at once (that would deliver it twice). If
  // the child is still running a few seconds later, the SIGINT was meant for
  // this process alone, and it is passed on.
  process.on("SIGINT", () => {
    setTimeout(() => {
      if (running()) child.kill("SIGINT");
    }, 3000).unref();
  });
  // A supervisor sends these to this process only: pass them on.
  for (const signal of ["SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      if (running()) child.kill(signal);
    });
  }
}

child.on("error", (err) => fail(spawnProblem(bin, err)));
child.on("exit", (code, signal) => {
  if (signal) {
    // End the same way the child did, so the caller sees the signal.
    process.removeAllListeners(signal);
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
