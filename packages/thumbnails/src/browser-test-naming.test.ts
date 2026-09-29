import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Test files that launch Chromium must be named `*.browser.test.ts(x)`. The root
// `test` scripts run them (with the browser-only e2e tier) in a bun test process
// of their own: in one long-lived process, after a few hundred other test files,
// Bun's child_process stdio setup can hand Chromium the wrong file descriptors and
// its launch fails with ENOENT. The suffix is what keeps a new browser test out of
// the shared process, so this check fails when a file calls the Chromium helpers
// without it.

const repoRoot = resolve(import.meta.dir, "../../..");
const self = "browser-test-naming.test.ts";

// A call to one of the helpers that gate or start a real browser.
const launchesBrowser = /\b(?:hasChromium|resolveChromium)\s*\(|\bchromium\s*\.\s*launch\s*\(/;

function misnamedBrowserTests(): string[] {
  const glob = new Glob("{packages,presentations}/*/**/*.test.{ts,tsx}");
  const found: string[] = [];
  for (const rel of glob.scanSync({ cwd: repoRoot })) {
    if (rel.includes("node_modules/") || rel.startsWith("packages/e2e/")) continue;
    if (rel.endsWith(self) || /\.browser\.test\.tsx?$/.test(rel)) continue;
    // Comment lines may name the helpers without calling them.
    const src = readFileSync(join(repoRoot, rel), "utf8")
      .split("\n")
      .filter((line) => !/^\s*(?:\/\/|\*)/.test(line))
      .join("\n");
    if (launchesBrowser.test(src)) found.push(rel);
  }
  return found.sort();
}

describe("browser test naming", () => {
  test("every test file that launches Chromium is named *.browser.test.*", () => {
    expect(misnamedBrowserTests()).toEqual([]);
  });

  test("the pattern recognises the helper calls", () => {
    expect(launchesBrowser.test("describe.skipIf(!hasChromium())(")).toBeTrue();
    expect(launchesBrowser.test("const p = resolveChromium();")).toBeTrue();
    expect(launchesBrowser.test("await chromium.launch({ headless: true })")).toBeTrue();
    expect(launchesBrowser.test("parseChromiumArgs(undefined)")).toBeFalse();
    expect(launchesBrowser.test('buildReport({ chromium: "/usr/bin/chromium" })')).toBeFalse();
  });
});
