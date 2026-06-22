#!/usr/bin/env bun
import { defineCommand, runMain } from "citty";
import { basename, join, resolve } from "node:path";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { addThumbnailsToFile, exportDeck } from "./index";
import type { ExportFormat, ThumbnailFormat } from "./index";

/** Parse a numeric flag value; undefined when absent or non-numeric (mirrors the
 *  previous CLI's lenient handling). */
function num(v: string | undefined): number | undefined {
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Coerce a thumbnail format string, ignoring anything unrecognized. */
function thumbFormat(v: string | undefined): ThumbnailFormat | undefined {
  return v === "webp" || v === "jpeg" || v === "png" ? v : undefined;
}

export const thumbsCommand = defineCommand({
  meta: {
    name: "thumbs",
    description: "(re)generate thumbnails for a built deck",
  },
  args: {
    deck: {
      type: "positional",
      required: false,
      description: "built deck .html",
      valueHint: "deck.html",
    },
    format: { type: "string", description: "image format", valueHint: "webp|jpeg|png" },
    width: { type: "string", description: "thumbnail width in px", valueHint: "640" },
    quality: { type: "string", description: "image quality", valueHint: "80" },
    scale: { type: "string", description: "device scale factor", valueHint: "2" },
  },
  async run({ args }) {
    const file = args.deck;
    if (!file) {
      console.error("error: missing <deck.html>, the built deck to thumbnail");
      process.exit(1);
    }
    const abs = resolve(file);
    try {
      if (!statSync(abs).isFile()) throw new Error("not a file");
    } catch {
      console.error(`cannot read deck: ${file}`);
      process.exit(1);
    }

    process.stderr.write(`▶  capturing thumbnails for ${file}\n`);
    try {
      const manifest = await addThumbnailsToFile(abs, {
        width: num(args.width),
        quality: num(args.quality),
        scale: num(args.scale),
        format: thumbFormat(args.format),
        onSlide: (i, n) => process.stderr.write(`\r   slide ${i + 1}/${n}   `),
      });
      process.stderr.write("\n");
      const n = Object.keys(manifest.thumbs).length;
      console.log(`✓ embedded ${n} thumbnail${n === 1 ? "" : "s"} (${manifest.w}×${manifest.h}) into ${file}`);
    } catch (e) {
      // Mirror `export`'s clean handling: a missing Chromium (the common case) should be a
      // one-line actionable error, not an uncaught stack trace that leaks internal paths.
      process.stderr.write("\n");
      console.error(`✕ thumbnails failed: ${(e as Error).message}`);
      process.exit(1);
    }
  },
});

/** Resolve the export format: an explicit `--format` wins, else infer from the
 *  output extension, else PNG. */
function inferFormat(explicit: string | undefined, out: string | undefined): ExportFormat {
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
 *  skipped, export does its own rendering), so `export <dir>` works in one shot. */
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

export const exportCommand = defineCommand({
  meta: {
    name: "export",
    description: "export slides to PNG or PDF",
  },
  args: {
    deck: {
      type: "positional",
      required: false,
      description: "deck .html or deck source dir (default: cwd)",
      valueHint: "deck.html|deck-dir",
    },
    dir: { type: "string", description: "deck directory (alternative to the positional)", valueHint: "deck" },
    format: { type: "string", description: "output format", valueHint: "png|pdf" },
    slides: { type: "string", description: "slide selection, e.g. 1,3,5-7", valueHint: "1,3,5-7" },
    out: {
      type: "string",
      alias: "o",
      description: "PNG: output directory (one file per slide); PDF: the .pdf file",
      valueHint: "path",
    },
    scale: { type: "string", description: "device scale factor", valueHint: "2" },
    width: { type: "string", description: "render width in px", valueHint: "1280" },
    quality: { type: "string", description: "image quality", valueHint: "92" },
    raster: { type: "boolean", description: "PDF: rasterize pages instead of vector (selectable) text" },
  },
  async run({ args }) {
    // Deck targeting ((internal ADR)): a leading positional, else --dir, else cwd.
    const target = args.deck ?? args.dir ?? ".";

    const out = args.out;
    const format = inferFormat(args.format, out);
    // PNG writes one file per slide into a directory; a `.png`-looking `-o` is almost
    // always a mistake (you'd get a directory literally named "foo.png"), warn ((internal ticket)).
    if (format === "png" && out && /\.png$/i.test(out)) {
      process.stderr.write(
        `⚠  --format png writes one file per slide into a DIRECTORY; "-o ${out}" will be a directory (created if needed), not a single PNG.\n`,
      );
    }
    const slides = args.slides;
    const width = num(args.width) ?? 1280;
    const scale = num(args.scale);
    const quality = num(args.quality);
    // PDF text mode: vector (selectable text) by default; --raster forces image pages.
    const pdfMode: "vector" | "raster" = args.raster ? "raster" : "vector";

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
  },
});

if (import.meta.main) void runMain(thumbsCommand);
