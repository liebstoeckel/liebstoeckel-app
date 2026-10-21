// Checks a global `npm i -g @liebstoeckel/cli` the way a user's machine would show
// a problem, and writes them as a report ($RELEASE_OUT/report-install.json):
// - `doctor` says the CLI runs on its pinned Bun, names the native esbuild for this
//   system and finds the system's Chrome on its own (LIEBSTOECKEL_CHROMIUM unset);
// - npm installed one Bun package and one esbuild package, the ones for this system;
// - on macOS neither binary carries a quarantine attribute (no Gatekeeper prompt),
//   and Bun's signature is shown;
// - a local install with --omit=optional fails with `bun_missing` and the fix.
//   node install-checks.mjs
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";
import { run } from "./lib.mjs";

const out = process.env.RELEASE_OUT;
const version = process.env.CLI_VERSION;
const temp = process.env.RUNNER_TEMP;
if (!out || !version || !temp) {
  console.error("usage: install-checks.mjs (with RELEASE_OUT, CLI_VERSION and RUNNER_TEMP set)");
  process.exit(2);
}
const results = [];
const check = (name, fn) => {
  try {
    const problem = fn();
    results.push({ check: name, ok: !problem, ...(problem ? { note: problem } : {}) });
  } catch (err) {
    results.push({ check: name, ok: false, note: String(err.message ?? err).split("\n")[0] });
  }
};
const platform = { linux: "linux", win32: "windows", darwin: "darwin" }[process.platform];
const arch = { x64: "x64", arm64: process.platform === "darwin" ? "aarch64" : "arm64" }[process.arch];
const esbuildPlatform = { linux: "linux", win32: "win32", darwin: "darwin" }[process.platform];
const { LIEBSTOECKEL_CHROMIUM: _chrome, ...env } = process.env;

let doctor = {};
check("doctor names the pinned Bun, the native esbuild and the system's Chrome", () => {
  const r = run("liebstoeckel", ["doctor", "--json"], { env, stdio: ["ignore", "pipe", "inherit"] });
  doctor = JSON.parse(r.stdout);
  console.log(JSON.stringify({ bun: doctor.bun, esbuild: doctor.esbuild, chromium: doctor.chromium }, null, 2));
  if (doctor.bun?.source !== "pinned") return `bun.source ${doctor.bun?.source}`;
  if (doctor.bun?.package !== `@oven/bun-${platform}-${arch}`) return `bun.package ${doctor.bun?.package}`;
  if (doctor.esbuild?.package !== `@esbuild/${esbuildPlatform}-${process.arch}`) return `esbuild.package ${doctor.esbuild?.package}`;
  if (!doctor.chromium?.ok) return `no Chrome found: ${JSON.stringify(doctor.chromium)}`;
  return null;
});

check("npm installed one Bun and one esbuild, the ones for this system", () => {
  // Where npm put the CLI's dependencies, from the pinned Bun doctor found (npm's own
  // `root -g` masks path parts that look like ids).
  const bunPath = String(doctor.bun?.path ?? "");
  const at = bunPath.lastIndexOf(`${sep}@oven${sep}`);
  if (at < 0) return `doctor names no @oven package path: ${bunPath}`;
  const nm = bunPath.slice(0, at);
  const cliNm = `${sep}@liebstoeckel${sep}cli${sep}node_modules`;
  const bases = nm.endsWith(cliNm) ? [nm, nm.slice(0, -cliNm.length)] : [nm];
  const found = [];
  for (const base of bases) {
    for (const scope of ["@oven", "@esbuild"]) {
      const at = join(base, scope);
      if (existsSync(at)) for (const d of readdirSync(at)) found.push(`${scope}/${d}`);
    }
  }
  console.log(`installed: ${found.join(", ")}`);
  const bun = found.filter((f) => f.startsWith("@oven/bun-"));
  const esb = found.filter((f) => f.startsWith("@esbuild/"));
  if (bun.length !== 1 || bun[0] !== `@oven/bun-${platform}-${arch}`) return `Bun packages: ${bun.join(", ") || "none"}`;
  if (esb.length !== 1 || esb[0] !== `@esbuild/${esbuildPlatform}-${process.arch}`) return `esbuild packages: ${esb.join(", ") || "none"}`;
  return null;
});

if (process.platform === "darwin") {
  check("no quarantine attribute on the pinned Bun or esbuild (no Gatekeeper prompt)", () => {
    const bins = [doctor.bun?.path, doctor.esbuild?.binaryPath].filter(Boolean);
    if (bins.length === 0) return "doctor named no binaries";
    for (const b of bins) {
      const x = run("xattr", ["-l", b], { stdio: ["ignore", "pipe", "pipe"] });
      if (/com\.apple\.quarantine/.test(x.stdout)) return `${b} is quarantined`;
    }
    const sig = run("codesign", ["-dv", doctor.bun.path], { stdio: ["ignore", "pipe", "pipe"] });
    console.log(`codesign of ${doctor.bun.path}:\n${sig.stderr}`);
    return null;
  });
}

check("a local install without optional dependencies fails with bun_missing and the fix", () => {
  const dir = mkdtempSync(join(temp, "omit-optional-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "omit-optional", private: true }));
  const i = run("npm", ["install", "--no-audit", "--no-fund", "--omit=optional", `@liebstoeckel/cli@${version}`], { cwd: dir });
  if (i.status !== 0) return `npm install exited ${i.status}`;
  const r = run("node", [join(dir, "node_modules", "@liebstoeckel", "cli", "bin", "liebstoeckel.js"), "--version", "--json"], {
    cwd: dir,
    stdio: ["ignore", "pipe", "pipe"],
  });
  console.log(r.stdout, r.stderr);
  if (r.status !== 1) return `exit ${r.status}, wanted 1`;
  if (!/bun_missing/.test(r.stdout + r.stderr)) return "no bun_missing in the output";
  return null;
});

writeFileSync(join(out, "report-install.json"), JSON.stringify({ ok: results.every((r) => r.ok), results }, null, 2) + "\n");
for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.check}${r.note ? `: ${r.note}` : ""}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
