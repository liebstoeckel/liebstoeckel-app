// Writes <out>/result.json for one job of the release matrix: area, system, status,
// seconds since the job's start, and the counts of what it ran, from every report
// in <out>: JUnit files of `bun test` (junit-*.xml) and the JSON reports the drivers
// print (report-*.json). Plain Node, no dependencies.
//
//   node result.mjs <out> <area> <system> <status> <start-epoch-seconds>
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const attr = (tag, name) => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return m ? m[1].replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") : "";
};

/** Counts and the skipped and failed test names of one JUnit file. */
export function readJunit(xml) {
  const out = { pass: 0, fail: 0, skip: 0, skipped: [], failed: [] };
  // A testcase is either self-closing or holds <failure>, <error> or <skipped>.
  for (const m of xml.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const tag = m[1];
    const body = m[3] ?? "";
    const name = [attr(tag, "classname"), attr(tag, "name")].filter(Boolean).join(" > ");
    if (/<(failure|error)\b/.test(body)) {
      out.fail++;
      out.failed.push(name);
    } else if (/<skipped\b/.test(body)) {
      out.skip++;
      out.skipped.push(name);
    } else out.pass++;
  }
  return out;
}

/** Counts of a driver report: `{ ok, results: [{ step | check, ok }] }`. */
export function readReport(json) {
  const out = { pass: 0, fail: 0, skip: 0, skipped: [], failed: [] };
  for (const r of json.results ?? []) {
    if (r.ok) out.pass++;
    else {
      out.fail++;
      out.failed.push(String(r.step ?? r.check ?? "?"));
    }
  }
  if (json.ok === false && out.fail === 0) {
    out.fail++;
    out.failed.push("the report says not ok");
  }
  return out;
}

export function collect(dir) {
  const total = { pass: 0, fail: 0, skip: 0, skipped: [], failed: [] };
  const add = (r) => {
    total.pass += r.pass;
    total.fail += r.fail;
    total.skip += r.skip;
    total.skipped.push(...r.skipped);
    total.failed.push(...r.failed);
  };
  const files = existsSync(dir) ? readdirSync(dir).sort() : [];
  for (const f of files) {
    try {
      if (/^junit-.*\.xml$/.test(f)) add(readJunit(readFileSync(join(dir, f), "utf8")));
      else if (/^report-.*\.json$/.test(f)) add(readReport(JSON.parse(readFileSync(join(dir, f), "utf8"))));
    } catch (err) {
      add({ pass: 0, fail: 1, skip: 0, skipped: [], failed: [`${f}: unreadable (${err.message})`] });
    }
  }
  return total;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [out, area, system, status, start] = process.argv.slice(2);
  if (!out || !area || !system) {
    console.error("usage: result.mjs <out> <area> <system> <status> <start-epoch-seconds>");
    process.exit(2);
  }
  const counts = collect(out);
  const seconds = start ? Math.round(Date.now() / 1000 - Number(start)) : null;
  const result = { area, system, status, seconds, ...counts };
  writeFileSync(join(out, "result.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(`${area} on ${system}: ${status}, ${seconds} s, ${counts.pass} pass, ${counts.fail} fail, ${counts.skip} skip`);
}
