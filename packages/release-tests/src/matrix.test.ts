// The release matrix's result and summary scripts (../matrix), on made-up reports.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error plain JavaScript modules without types
import { collect, readJunit, readReport } from "../matrix/result.mjs";
// @ts-expect-error plain JavaScript modules without types
import { skipReasons, summarize } from "../matrix/summary.mjs";

const JUNIT = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites><testsuite name="a.test.ts">
  <testcase name="passes" classname="suite one" time="0.1" />
  <testcase name="fails" classname="suite one" time="0.1"><failure message="x" /></testcase>
  <testcase name="skips" classname="browser (skipped: no Chromium)" time="0"><skipped /></testcase>
  <testcase name="skips too" classname="browser (skipped: no Chromium)" time="0"><skipped /></testcase>
</testsuite></testsuites>`;

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe("result", () => {
  test("counts a JUnit file and names what failed and what was skipped", () => {
    const r = readJunit(JUNIT);
    expect([r.pass, r.fail, r.skip]).toEqual([1, 1, 2]);
    expect(r.failed).toEqual(["suite one > fails"]);
    expect(skipReasons(r.skipped)).toEqual(["browser (skipped: no Chromium) (2)"]);
    expect(skipReasons(["dev > SIGTERM (skipped: Windows has no SIGTERM)", "dev > other"])).toEqual(["SIGTERM (skipped: Windows has no SIGTERM) (1)", "dev (1)"]);
  });

  test("counts a driver report, and a report that is not ok without a failed step still fails", () => {
    expect(readReport({ ok: false, results: [{ step: "a", ok: true }, { step: "b", ok: false }] })).toMatchObject({ pass: 1, fail: 1, failed: ["b"] });
    expect(readReport({ ok: false, results: [] }).fail).toBe(1);
  });

  test("collect reads every report in the directory and an unreadable one counts as a failure", () => {
    const d = mkdtempSync(join(tmpdir(), "lst-result-"));
    dirs.push(d);
    writeFileSync(join(d, "junit-unit.xml"), JUNIT);
    writeFileSync(join(d, "report-live.json"), JSON.stringify({ ok: true, results: [{ check: "vote", ok: true }] }));
    writeFileSync(join(d, "report-bad.json"), "{");
    writeFileSync(join(d, "dev.log"), "ignored");
    const r = collect(d);
    expect([r.pass, r.fail, r.skip]).toEqual([2, 2, 2]);
  });
});

describe("summary", () => {
  const artifacts = (hashes: Record<string, string>) => {
    const d = mkdtempSync(join(tmpdir(), "lst-summary-"));
    dirs.push(d);
    for (const [name, text] of Object.entries(hashes)) {
      mkdirSync(join(d, name));
      writeFileSync(join(d, name, "result.json"), JSON.stringify({ area: name.split("-")[1], system: name.split("-").at(-1), status: "success", seconds: 75, pass: 3, fail: 0, skip: 0, skipped: [], failed: [] }));
      writeFileSync(join(d, name, "hashes.txt"), text);
    }
    return d;
  };

  test("one hash per kind passes and lists every build", () => {
    const { markdown, problems } = summarize(
      artifacts({ "results-install-Linux": "scaffold npm-i-g aaa\nfixture plain bbb\n", "results-variants-Windows": "scaffold npx aaa\n" }),
    );
    expect(problems).toEqual([]);
    expect(markdown).toContain("| scaffold | Windows | npx | `aaa` |");
    expect(markdown).toContain("| install | Linux | success | 1m 15s | 3 | 0 | 0 |  |");
  });

  test("two hashes of one kind fail", () => {
    const { problems } = summarize(artifacts({ "results-install-Linux": "fixture plain bbb\n", "results-install-macOS": "fixture plain ccc\n" }));
    expect(problems).toEqual(["fixture: 2 different hashes over 2 builds"]);
  });

  test("no hash at all fails", () => {
    expect(summarize(artifacts({ "results-suite-Linux": "" })).problems).toEqual(["no build hash was recorded"]);
  });
});
