// Process helpers for the release matrix scripts: run a command the way a shell
// would find it (npm, npx and pnpm are .cmd files on Windows), start a server in the
// background and stop it with everything it started.
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";

export const WINDOWS = process.platform === "win32";

/** Quote one argument for cmd.exe (only Windows runs commands through a shell). */
const quote = (a) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a);

/** Run a command to the end with its output on ours; returns the exit status. */
export function run(cmd, args, opts = {}) {
  console.log(`$ ${[cmd, ...args].join(" ")}`);
  const r = WINDOWS
    ? spawnSync([cmd, ...args].map(quote).join(" "), { ...opts, shell: true, stdio: opts.stdio ?? "inherit", encoding: "utf8" })
    : spawnSync(cmd, args, { ...opts, stdio: opts.stdio ?? "inherit", encoding: "utf8" });
  if (r.error) throw r.error;
  return r;
}

/** Like run, but throws on a non-zero exit. */
export function must(cmd, args, opts = {}) {
  const r = run(cmd, args, opts);
  if (r.status !== 0) throw new Error(`${[cmd, ...args].join(" ")} exited ${r.status}${r.stderr ? `\n${r.stderr}` : ""}`);
  return r;
}

/** Start a server in the background, its output into `log`. */
export function start(cmd, args, log, opts = {}) {
  console.log(`$ ${[cmd, ...args].join(" ")} > ${log} &`);
  const out = createWriteStream(log);
  const child = WINDOWS
    ? spawn([cmd, ...args].map(quote).join(" "), { ...opts, shell: true, stdio: ["ignore", "pipe", "pipe"] })
    : spawn(cmd, args, { ...opts, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  return child;
}

/** Stop a server and every process it started (the CLI runs its pinned Bun as a child). */
export function stop(child) {
  if (child.exitCode !== null) return;
  if (WINDOWS) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

/** Wait until a URL answers with any status below 500. */
export async function waitHttp(url, ms) {
  const deadline = Date.now() + ms;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return res;
      last = `status ${res.status}`;
    } catch (err) {
      last = String(err);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} did not answer within ${ms} ms: ${last}`);
}
