// The release matrix's summary: one row per area and system (status, time, test
// counts, skip reasons), and every build hash the jobs recorded. Each kind of build
// (the scaffolded deck, the release fixture) must have one hash on every system and
// in every way it was installed or placed; otherwise this exits 1. Plain Node.
//
//   node summary.mjs <dir>     # <dir>/results-<area>-<system>/{result.json,hashes.txt}
//
// Prints Markdown for $GITHUB_STEP_SUMMARY.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** `<kind> <what> <sha256>` lines of a hashes.txt. */
export function parseHashes(text, system) {
  return text
    .split("\n")
    .map((l) => l.trim().split(/\s+/))
    .filter((p) => p.length === 3)
    .map(([kind, what, hash]) => ({ kind, what, hash, system }));
}

/** Skipped test names grouped by the part that gives the reason ("... (skipped: why)"),
 *  else by the part before the first " > " (the describe). */
export function skipReasons(skipped) {
  const counts = new Map();
  for (const name of skipped) {
    const parts = name.split(" > ");
    const group = parts.find((p) => p.includes("(skipped:")) ?? (parts[0] || name);
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  return [...counts].map(([group, n]) => `${group} (${n})`);
}

export function summarize(dir) {
  const results = [];
  const hashes = [];
  for (const d of existsSync(dir) ? readdirSync(dir).sort() : []) {
    const at = join(dir, d);
    if (existsSync(join(at, "result.json"))) results.push(JSON.parse(readFileSync(join(at, "result.json"), "utf8")));
    if (existsSync(join(at, "hashes.txt"))) {
      const system = d.split("-").at(-1); // results-<area>-<system>
      hashes.push(...parseHashes(readFileSync(join(at, "hashes.txt"), "utf8"), system));
    }
  }
  const lines = ["## Release matrix", "", "| area | system | status | time | pass | fail | skip | skipped |", "|---|---|---|---|---|---|---|---|"];
  const order = ["suite", "install", "install-tier", "browser", "live", "variants"];
  results.sort((a, b) => order.indexOf(a.area) - order.indexOf(b.area) || a.system.localeCompare(b.system));
  for (const r of results) {
    const time = r.seconds == null ? "" : `${Math.floor(r.seconds / 60)}m ${String(r.seconds % 60).padStart(2, "0")}s`;
    const skipped = skipReasons(r.skipped ?? []).join("; ").replace(/\|/g, "\\|");
    lines.push(`| ${r.area} | ${r.system} | ${r.status} | ${time} | ${r.pass} | ${r.fail} | ${r.skip} | ${skipped} |`);
  }
  const failedNames = results.flatMap((r) => (r.failed ?? []).map((f) => `${r.area} on ${r.system}: ${f}`));
  if (failedNames.length) lines.push("", "### Failed", "", ...failedNames.map((f) => `- ${f.replace(/\|/g, "\\|")}`));

  const problems = [];
  lines.push("", "### Build hashes", "", "| kind | system | how | sha256 |", "|---|---|---|---|");
  const kinds = [...new Set(hashes.map((h) => h.kind))].sort();
  for (const kind of kinds) {
    const rows = hashes.filter((h) => h.kind === kind);
    for (const h of rows) lines.push(`| ${kind} | ${h.system} | ${h.what} | \`${h.hash}\` |`);
    const unique = new Set(rows.map((h) => h.hash));
    if (unique.size !== 1) problems.push(`${kind}: ${unique.size} different hashes over ${rows.length} builds`);
  }
  if (kinds.length === 0) problems.push("no build hash was recorded");
  lines.push("");
  if (problems.length) lines.push("**Not the same bytes:**", "", ...problems.map((p) => `- ${p}`), "");
  else lines.push("Every kind of build has the same bytes on every system and in every place.", "");
  return { markdown: lines.join("\n"), problems };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: summary.mjs <dir>");
    process.exit(2);
  }
  const { markdown, problems } = summarize(dir);
  console.log(markdown);
  for (const p of problems) console.error(p);
  process.exit(problems.length ? 1 : 0);
}
