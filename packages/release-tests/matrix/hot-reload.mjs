// `liebstoeckel dev` on the release fixture and the hot reload driver against it in
// one browser engine. The driver's JSON report goes to $RELEASE_OUT/report-*.json,
// the dev server's output and screenshots of failed steps next to it. Then, outside
// Windows, that stopping `dev` leaves no process behind.
//   node hot-reload.mjs <fixture-dir> <chromium|webkit> <port>
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { WINDOWS, run, start, stop, waitHttp } from "./lib.mjs";

const [dir, engine, port] = process.argv.slice(2);
const out = process.env.RELEASE_OUT;
const drivers = join(process.env.RUNNER_TEMP ?? "", "drivers");
if (!dir || !engine || !port || !out) {
  console.error("usage: hot-reload.mjs <fixture-dir> <chromium|webkit> <port> (with RELEASE_OUT and RUNNER_TEMP set)");
  process.exit(2);
}
const base = `http://127.0.0.1:${port}`;
const dev = start("liebstoeckel", ["dev", "--dir", dir, "--port", port, "--json"], join(out, `dev-${engine}.log`));
let status = 1;
try {
  await waitHttp(`${base}/__dev/ping`, 120_000);
  const r = run("node", [join(drivers, "release-hot-reload.ts"), dir, base, "--browser", engine, "--shots", join(out, "shots"), "--", "liebstoeckel"], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  writeFileSync(join(out, `report-hot-reload-${engine}.json`), r.stdout || "{}");
  console.log(r.stdout);
  status = r.status ?? 1;
} finally {
  stop(dev);
}

// Stopping `dev` leaves nothing behind: Ctrl+C in a terminal (SIGINT to the whole
// process group), and SIGTERM to the launcher alone (a process manager, a closed
// tab). Windows has neither signal; the job ends its processes itself.
if (!WINDOWS && engine === "chromium") {
  const results = [];
  const left = (pgid) => spawnSync("pgrep", ["-g", String(pgid)], { encoding: "utf8" }).stdout.trim();
  const gone = async (pgid, ms) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline && left(pgid)) await new Promise((r) => setTimeout(r, 200));
    return left(pgid);
  };
  for (const [name, signal, group] of [
    ["Ctrl+C (SIGINT to the process group) leaves no process", "SIGINT", true],
    ["SIGTERM to the launcher alone stops the server too", "SIGTERM", false],
  ]) {
    const p = String(Number(port) + (group ? 1 : 2));
    const d = start("liebstoeckel", ["dev", "--dir", dir, "--port", p, "--json"], join(out, `dev-${signal}.log`));
    try {
      await waitHttp(`http://127.0.0.1:${p}/__dev/ping`, 120_000);
      process.kill(group ? -d.pid : d.pid, signal);
      const rest = await gone(d.pid, 10_000);
      results.push({ check: name, ok: !rest, ...(rest ? { note: `still running: ${spawnSync("ps", ["-o", "pid,command", "-g", String(d.pid)], { encoding: "utf8" }).stdout}` } : {}) });
    } catch (err) {
      results.push({ check: name, ok: false, note: String(err.message ?? err) });
    } finally {
      stop(d);
    }
  }
  writeFileSync(join(out, "report-dev-signals.json"), JSON.stringify({ ok: results.every((r) => r.ok), results }, null, 2) + "\n");
  for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.check}${r.note ? `: ${r.note}` : ""}`);
  if (!results.every((r) => r.ok)) status = 1;
}
process.exit(status);
