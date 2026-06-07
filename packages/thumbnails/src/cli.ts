#!/usr/bin/env bun
import { basename, join, resolve } from "node:path";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { addThumbnailsToFile, exportDeck } from "./index";
import type { ExportFormat, ThumbnailFormat } from "./index";

function flagNum(argv: string[], name: string): number | undefined {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const n = Number(argv[i + 1]);
  return Number.isFinite(n) ? n : undefined;
}

function flagFormat(argv: string[]): ThumbnailFormat | undefined {
  const i = argv.indexOf("--format");
  const v = i >= 0 ? argv[i + 1] : undefined;
  return v === "webp" || v === "jpeg" || v === "png" ? v : undefined;
}

const THUMBS_USAGE =
  "usage: liebstoeckel thumbs <built-deck.html> [--format webp|jpeg|png] [--width 640] [--quality 80] [--scale 2]";

export async function runThumbs(argv: string[]) {
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(THUMBS_USAGE);
    return;
  }
  const file = argv.find((a) => !a.startsWith("-"));
  if (!file) {
    console.error(THUMBS_USAGE);
    process.exit(1);
  }
  const abs = resolve(file);
  try {
    if (!statSync(abs).isFile()) throw new Error("not a file");
  } catch {
    console.error(`cannot read deck: ${file}`);
    process.exit(1);
  }

  const width = flagNum(argv, "--width");
  const quality = flagNum(argv, "--quality");
  const scale = flagNum(argv, "--scale");
  const format = flagFormat(argv);

  process.stderr.write(`▶  capturing thumbnails for ${file}\n`);
  const manifest = await addThumbnailsToFile(abs, {
    width,
    quality,
    scale,
    format,
    onSlide: (i, n) => process.stderr.write(`\r   slide ${i + 1}/${n}   `),
  });
  process.stderr.write("\n");
  const n = Object.keys(manifest.thumbs).length;
  console.log(`✓ embedded ${n} thumbnail${n === 1 ? "" : "s"} (${manifest.w}×${manifest.h}) into ${file}`);
}

function flagStr(argv: string[], ...names: string[]): string | undefined {
  for (const name of names) {
    const i = argv.indexOf(name);
    if (i >= 0) return argv[i + 1];
  }
  return undefined;
}

function inferFormat(argv: string[], out: string | undefined): ExportFormat {
  const explicit = flagStr(argv, "--format");
  if (explicit === "png" || explicit === "pdf") return explicit;
  if (out && /\.pdf$/i.test(out)) return "pdf";
  if (out && /\.png$/i.test(out)) return "png";
  return "png";
}

/** A human-friendly base name for output files: a deck's `index.html` borrows its
 *  directory's name, skipping a build dir (`dist`/`build`/`out`) so a deck built to
 *  `foo/dist/index.html` is named "foo"; anything else uses its own filename stem. */
function deckBaseName(target: string): string {
  const stem = basename(target).replace(/\.html?$/i, "");
  if (stem !== "index") return stem || "deck";
  let dir = resolve(target, "..");
  if (/^(dist|build|out)$/i.test(basename(dir))) dir = resolve(dir, "..");
  return basename(dir) || "deck";
}

/** Resolve the export input to a built deck HTML string. A `.html` file is read
 *  directly; a deck source directory is bundled to a temp dir first (thumbnails
 *  skipped — export does its own rendering), so `export <dir>` works in one shot. */
async function resolveDeckHtml(target: string): Promise<{ html: string; base: string }> {
  const abs = resolve(target);
  let isFile = false;
  try {
    isFile = statSync(abs).isFile();
  } catch {
    /* not a file */
  }

  if (isFile && /\.html?$/i.test(abs)) {
    return { html: await Bun.file(abs).text(), base: deckBaseName(abs) };
  }

  // treat as a deck source directory → bundle it to a throwaway dir
  const { bundleDeck } = await import("@liebstoeckel/engine/build");
  const outdir = mkdtempSync(join(tmpdir(), "lst-export-"));
  const prev = process.cwd();
  process.chdir(abs);
  try {
    await bundleDeck({ entry: "./index.html", outdir, inlinePackage: false });
  } finally {
    process.chdir(prev);
  }
  return { html: await Bun.file(join(outdir, "index.html")).text(), base: basename(abs) };
}

const EXPORT_USAGE =
  "usage: liebstoeckel export <deck.html|deck-dir> [--format png|pdf] [--slides 1,3,5-7] [-o <path>] [--scale 2] [--width 1280] [--raster] [--quality 92]\n" +
  "       PNG: -o is an output DIRECTORY (one file per slide). PDF: -o is the .pdf file.";

export async function runExport(argv: string[]) {
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(EXPORT_USAGE);
    return;
  }
  const target = argv.find((a) => !a.startsWith("-"));
  if (!target) {
    console.error(EXPORT_USAGE);
    process.exit(1);
  }

  const out = flagStr(argv, "-o", "--out");
  const format = inferFormat(argv, out);
  // PNG writes one file per slide into a directory; a `.png`-looking `-o` is almost
  // always a mistake (you'd get a directory literally named "foo.png") — warn (ticket 0030).
  if (format === "png" && out && /\.png$/i.test(out)) {
    process.stderr.write(
      `⚠  --format png writes one file per slide into a DIRECTORY; "-o ${out}" will be a directory (created if needed), not a single PNG.\n`,
    );
  }
  const slides = flagStr(argv, "--slides");
  const width = flagNum(argv, "--width") ?? 1280;
  const scale = flagNum(argv, "--scale");
  const quality = flagNum(argv, "--quality");
  // PDF text mode: vector (selectable text) by default; --raster forces image pages.
  const pdfMode: "vector" | "raster" = argv.includes("--raster") ? "raster" : "vector";

  let html: string;
  let base: string;
  try {
    ({ html, base } = await resolveDeckHtml(target));
  } catch (e) {
    console.error(`✕ cannot prepare deck: ${(e as Error).message}`);
    process.exit(1);
    return;
  }

  const label = format === "pdf" ? `PDF (${pdfMode})` : "PNG";
  process.stderr.write(`▶  exporting ${base} → ${label}\n`);
  try {
    const { written, pages, count } = await exportDeck(html, {
      format,
      slides,
      width,
      scale,
      quality,
      pdfMode,
      baseName: base,
      outDir: format === "png" ? out : undefined,
      outFile: format === "pdf" ? out : undefined,
      onSlide: (i, n) => process.stderr.write(`\r   slide ${i + 1}/${n}   `),
    });
    process.stderr.write("\n");
    if (written.length === 0) {
      console.error(`✕ no slides matched${slides ? ` "${slides}"` : ""} (deck has ${count} slide${count === 1 ? "" : "s"})`);
      process.exit(1);
    }
    if (format === "pdf") {
      console.log(`✓ exported ${pages} slide${pages === 1 ? "" : "s"} → ${written[0]}`);
    } else {
      console.log(`✓ exported ${pages} PNG${pages === 1 ? "" : "s"}:`);
      for (const f of written) console.log(`   ${f}`);
    }
  } catch (e) {
    console.error(`✕ export failed: ${(e as Error).message}`);
    process.exit(1);
  }
}

if (import.meta.main) void runThumbs(process.argv.slice(2));
