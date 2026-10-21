// End-to-end coverage for printing a deck onto paper: `liebstoeckel export
// --page-size a4|letter ...` through the real CLI against a real built deck, so
// PrintView's paper layout (page box, fitted + scaled canvas) and the driver's
// paper size agree. Asserts the PDF's physical page geometry and, for the vector
// mode, that the text layer survives the CSS scale transform. Needs Chromium
// (skips cleanly otherwise; LIEBSTOECKEL_CHROMIUM also counts).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { buildFixture, chromiumPath } from "./harness";

const BUN = process.execPath;
const REPO = join(import.meta.dir, "..", "..", "..");
const CLI = join(REPO, "packages", "cli", "src", "cli.ts");
// The CLI drives the browser itself (over CDP on Windows), so Playwright is not needed here.
const hasChromium = !!chromiumPath();

let dir = "";
let deck = "";

beforeAll(async () => {
  if (!hasChromium) return;
  dir = mkdtempSync(join(tmpdir(), "lst-e2e-paper-"));
  deck = join(dir, "deck.html");
  writeFileSync(deck, await buildFixture());
});

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

async function exportPdf(name: string, args: string[]): Promise<{ code: number; stderr: string; pdf: Uint8Array; text: string }> {
  const out = join(dir, name);
  const proc = Bun.spawnSync([BUN, CLI, "export", deck, "--format", "pdf", "-o", out, ...args], {
    cwd: REPO,
    stdout: "pipe",
    stderr: "pipe",
  });
  const pdf = proc.success ? new Uint8Array(await Bun.file(out).arrayBuffer()) : new Uint8Array();
  return { code: proc.exitCode, stderr: proc.stderr.toString(), pdf, text: new TextDecoder("latin1").decode(pdf) };
}

/** MediaBox of the first page, in points. */
function mediaBox(text: string): number[] {
  const m = /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(text);
  if (!m) throw new Error("no MediaBox");
  return m.slice(1, 5).map(Number);
}

function pageCount(text: string): number {
  const counts = [...text.matchAll(/\/Type\s*\/Pages[^>]*\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  return Math.max(...counts);
}

/** Count text-show operators across the PDF's flate streams. */
function textOps(pdf: Uint8Array, text: string): number {
  let ops = 0;
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const start = m.index + m[0].length;
    const end = text.indexOf("endstream", start);
    if (end < 0) continue;
    try {
      ops += (inflateSync(pdf.subarray(start, end)).toString("latin1").match(/\b(Tj|TJ)\b/g) ?? []).length;
    } catch {
      /* not a flate stream */
    }
  }
  return ops;
}

/** The first flate stream that holds drawing operators (page 1's content). */
function firstContentStream(pdf: Uint8Array, text: string): string {
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const start = m.index + m[0].length;
    const end = text.indexOf("endstream", start);
    if (end < 0) continue;
    try {
      const body = inflateSync(pdf.subarray(start, end)).toString("latin1");
      if (/\bcm\b/.test(body) && /\b(Tj|TJ)\b/.test(body)) return body;
    } catch {
      /* not a flate stream */
    }
  }
  return "";
}

describe.skipIf(!hasChromium)(`export --page-size (paper PDF, real deck through the CLI)${hasChromium ? "" : " (skipped: no Chromium, set LIEBSTOECKEL_CHROMIUM)"}`, () => {
  test("vector A4 landscape: physical page, every slide, text layer intact under the scale", async () => {
    const r = await exportPdf("a4.pdf", ["--page-size", "a4"]);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain("A4 landscape");
    // Chromium snaps the requested paper to its own print units, so allow ~1pt.
    const [, , w, h] = mediaBox(r.text);
    expect(Math.abs(w - 841.89)).toBeLessThan(1.5);
    expect(Math.abs(h - 595.28)).toBeLessThan(1.5);
    expect(pageCount(r.text)).toBeGreaterThan(1);
    expect(textOps(r.pdf, r.text)).toBeGreaterThan(0);
  }, 120_000);

  test("portrait, many pages: no print-time shrink (page 1 is laid out the same alone and in a multi-page export)", async () => {
    // Chromium's print pass shrinks every page to fit any overflow it can see
    // once a document paginates; under a CSS transform the backdrop blooms
    // escaped the page clip and portrait exports came out ~8% small and
    // off-center. Page 1's content stream must not depend on how many pages follow.
    const one = await exportPdf("p1.pdf", ["--page-size", "letter", "--orientation", "portrait", "--slides", "1"]);
    const two = await exportPdf("p12.pdf", ["--page-size", "letter", "--orientation", "portrait", "--slides", "1-2"]);
    expect(one.code).toBe(0);
    expect(two.code).toBe(0);
    expect(pageCount(two.text)).toBe(2);
    const a = firstContentStream(one.pdf, one.text);
    const b = firstContentStream(two.pdf, two.text);
    expect(a.length).toBeGreaterThan(100);
    expect(b).toBe(a);
  }, 120_000);

  test("raster Letter portrait with a custom margin: same geometry as vector, image fitted", async () => {
    const r = await exportPdf("letter.pdf", ["--page-size", "letter", "--orientation", "portrait", "--margin", "0.5in", "--raster", "--slides", "1-2"]);
    expect(r.code).toBe(0);
    expect(mediaBox(r.text)).toEqual([0, 0, 612, 792]);
    expect(pageCount(r.text)).toBe(2);
    // 16:9 fitted into 612 - 2*36 = 540 wide → 303.75 tall, centered on the page
    expect(r.text).toContain("q 540 0 0 303.75 36 244.13 cm /Im0 Do Q");
  }, 120_000);

  test("the invalid combinations fail loudly", async () => {
    const a = await exportPdf("bad1.pdf", ["--page-size", "a4", "--width", "1920"]);
    expect(a.code).toBe(1);
    expect(a.stderr).toContain("exclusive");
    const b = await exportPdf("bad2.pdf", ["--page-size", "tabloid"]);
    expect(b.code).toBe(1);
    expect(b.stderr).toContain("unknown page size");
  }, 60_000);
});
