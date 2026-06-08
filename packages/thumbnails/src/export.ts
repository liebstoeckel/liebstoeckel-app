import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { printDeckPdf, renderDeckSlides, type RenderDriveOptions } from "./capture";

/**
 * Static export of a built deck to PNG files or a single PDF ((internal ADR)), riding on
 * the shared slide driver ((internal ADR)). PNGs come straight off the page; the PDF is
 * one slide per page, each a JPEG drawn full-bleed, composed without a PDF library.
 *
 * `parseSlideRange` and `pdfFromJpegPages` are pure and unit-tested; `exportDeck`
 * is the orchestrator that drives the browser and writes files.
 */

export type ExportFormat = "png" | "pdf";

// ── slide range grammar (pure) ───────────────────────────────────────────────

/**
 * Parse a human, 1-based, inclusive slide spec into ordered, de-duped **0-based**
 * indices. Grammar (comma-separated parts):
 *   "3"      → slide 3
 *   "2-5"    → slides 2,3,4,5
 *   "3-"     → slide 3 through the end
 *   "-4"     → slide 1 through 4
 *   "1,3,5-7"→ mixed
 * An empty / whitespace-only spec means "every slide". Out-of-range or malformed
 * parts throw — export should refuse a spec it can't honor rather than silently
 * drop slides.
 */
export function parseSlideRange(spec: string | undefined, count: number): number[] {
  if (count <= 0) return [];
  const all = Array.from({ length: count }, (_, i) => i);
  if (spec == null || spec.trim() === "") return all;

  const out = new Set<number>();
  for (const raw of spec.split(",")) {
    const part = raw.trim();
    if (part === "") continue;
    const m = part.match(/^(\d+)?\s*-\s*(\d+)?$|^(\d+)$/);
    if (!m) throw new Error(`bad slide spec "${part}" (use e.g. "3", "2-5", "1,3,5-7", "3-", "-4")`);

    if (m[3] != null) {
      // single slide
      const n = Number(m[3]);
      assertInRange(n, count, part);
      out.add(n - 1);
    } else {
      // range; open-ended on either side
      const from = m[1] != null ? Number(m[1]) : 1;
      const to = m[2] != null ? Number(m[2]) : count;
      assertInRange(from, count, part);
      assertInRange(to, count, part);
      if (from > to) throw new Error(`bad slide range "${part}" (${from} > ${to})`);
      for (let n = from; n <= to; n++) out.add(n - 1);
    }
  }
  return [...out].sort((a, b) => a - b);
}

function assertInRange(n: number, count: number, part: string): void {
  if (!Number.isInteger(n) || n < 1 || n > count) {
    throw new Error(`slide ${n} out of range in "${part}" (deck has ${count} slide${count === 1 ? "" : "s"})`);
  }
}

// ── PDF composer (pure, dependency-free) ─────────────────────────────────────

export interface JpegPage {
  jpeg: Uint8Array;
  /** intrinsic pixel dimensions of the JPEG. */
  w: number;
  h: number;
}

/**
 * Compose JPEG images into a minimal PDF — one image per page, drawn full-bleed.
 * Each page's `MediaBox` is the logical `pageW`×`pageH` (points); the hi-res JPEG
 * is scaled into it, so the on-page resolution rides the capture scale factor.
 * Hand-rolled (one `DCTDecode` XObject per page) to avoid a PDF dependency.
 */
export function pdfFromJpegPages(pages: JpegPage[], pageW: number, pageH: number): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const push = (data: Uint8Array | string): void => {
    const b = typeof data === "string" ? enc.encode(data) : data;
    chunks.push(b);
    offset += b.length;
  };

  // obj 1 = Catalog, obj 2 = Pages, then 3 objects per page (Page, Contents, Image).
  const total = 2 + pages.length * 3;
  const offsets = new Array<number>(total + 1).fill(0);
  const obj = (n: number, body: Uint8Array | string): void => {
    offsets[n] = offset;
    push(`${n} 0 obj\n`);
    push(body);
    push("\nendobj\n");
  };

  push("%PDF-1.4\n");
  // binary marker so tools treat the file as binary
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const pageObjNum = (i: number) => 3 + i * 3;
  const kids = pages.map((_, i) => `${pageObjNum(i)} 0 R`).join(" ");

  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);

  pages.forEach((pg, i) => {
    const pageN = pageObjNum(i);
    const contentN = pageN + 1;
    const imageN = pageN + 2;

    obj(
      pageN,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
        `/Resources << /XObject << /Im0 ${imageN} 0 R >> >> /Contents ${contentN} 0 R >>`,
    );

    const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;
    obj(contentN, `<< /Length ${enc.encode(content).length} >>\nstream\n${content}\nendstream`);

    // image XObject — body is a dict header, the raw JPEG bytes, then the stream tail
    offsets[imageN] = offset;
    push(`${imageN} 0 obj\n`);
    push(
      `<< /Type /XObject /Subtype /Image /Width ${pg.w} /Height ${pg.h} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpeg.length} >>\nstream\n`,
    );
    push(pg.jpeg);
    push("\nendstream\nendobj\n");
  });

  // cross-reference table
  const xrefOffset = offset;
  push(`xref\n0 ${total + 1}\n`);
  push("0000000000 65535 f\r\n");
  for (let n = 1; n <= total; n++) {
    push(`${String(offsets[n]).padStart(10, "0")} 00000 n\r\n`);
  }
  push(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  // concat
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(totalLen);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

// ── orchestrator ─────────────────────────────────────────────────────────────

export interface ExportOptions extends Omit<RenderDriveOptions, "onSlide"> {
  format: ExportFormat;
  /** 1-based slide spec (e.g. "3", "2-5", "1,3,5-7", "3-", "-4"); default all.
   *  Resolved against the real slide count, so open-ended ranges work. */
  slides?: string;
  /** PNG: directory the per-slide files are written into. Defaults to cwd. */
  outDir?: string;
  /** PDF: file path to write. Defaults to `<baseName>.pdf` in cwd. */
  outFile?: string;
  /** Base name for default output filenames (e.g. the deck name). */
  baseName?: string;
  /** JPEG quality for PDF pages, 0–100 (default 92). Raster PDF only. */
  quality?: number;
  /** PDF rendering mode (default "vector"):
   *   • "vector" — one `page.pdf()` over a stacked print view → **selectable text**,
   *     vector graphics, smallest files. The default and recommended PDF.
   *   • "raster" — one full-bleed JPEG per page → no text layer, but pixel-exact
   *     fidelity for slides with effects that don't reproduce under print. */
  pdfMode?: "vector" | "raster";
  /** progress callback: (nth-rendered, total-to-render). */
  onSlide?(index: number, total: number): void;
}

export interface ExportResult {
  /** absolute (or as-given) paths written. */
  written: string[];
  /** number of slides actually rendered (pages in the PDF / PNG files). */
  pages: number;
  /** total slides the deck has. */
  count: number;
}

/** Export a built single-file deck to PNG files or a PDF ((internal ADR)). **Loud** —
 *  throws if no Chromium is available (export is explicit, unlike thumbnails). */
export async function exportDeck(html: string, opts: ExportOptions): Promise<ExportResult> {
  const base = opts.baseName ?? "deck";
  const selectIndices =
    opts.slides != null && opts.slides.trim() !== ""
      ? (count: number) => parseSlideRange(opts.slides, count)
      : opts.selectIndices;

  // Vector PDF (default): one page.pdf() over a stacked print view → selectable text.
  if (opts.format === "pdf" && opts.pdfMode !== "raster") {
    const { pdf, count, pages } = await printDeckPdf(html, {
      pageWidth: opts.width,
      pageHeight: opts.height,
      executablePath: opts.executablePath,
      launchArgs: opts.launchArgs,
      timeoutMs: opts.timeoutMs,
      selectIndices,
    });
    const outFile = opts.outFile ?? `${base}.pdf`;
    await mkdir(dirname(outFile), { recursive: true });
    await Bun.write(outFile, pdf);
    return { written: [outFile], pages, count };
  }

  // One render pass into memory. We only learn the deck's true slide count after
  // the driver returns, so collect frames first, then name + write with the final
  // pad width — no rename dance.
  const isPdf = opts.format === "pdf";
  const quality = opts.quality ?? 92;
  const frames: { index: number; bytes: Uint8Array }[] = [];
  const driveOpts: RenderDriveOptions = { ...opts, selectIndices };
  const drive = await renderDeckSlides(html, driveOpts, async (i, page) => {
    const bytes = isPdf
      ? await page.screenshot({ type: "jpeg", quality })
      : await page.screenshot({ type: "png" });
    frames.push({ index: i, bytes });
  });
  frames.sort((a, b) => a.index - b.index);

  // Pad slide numbers to the width of the deck's total count (min 2): slide-03 etc.
  const padW = Math.max(2, String(drive.count).length);
  const written: string[] = [];

  if (!isPdf) {
    const outDir = opts.outDir ?? ".";
    await mkdir(outDir, { recursive: true });
    for (const f of frames) {
      const file = join(outDir, `${base}-slide-${String(f.index + 1).padStart(padW, "0")}.png`);
      await Bun.write(file, f.bytes);
      written.push(file);
    }
    return { written, pages: frames.length, count: drive.count };
  }

  const pageW = opts.width ?? 1280;
  const pageH = opts.height ?? Math.round((pageW * 9) / 16);
  const pdf = pdfFromJpegPages(
    frames.map((f) => ({ jpeg: f.bytes, w: drive.w, h: drive.h })),
    pageW,
    pageH,
  );
  const outFile = opts.outFile ?? `${base}.pdf`;
  await mkdir(dirname(outFile), { recursive: true });
  await Bun.write(outFile, pdf);
  written.push(outFile);
  return { written, pages: frames.length, count: drive.count };
}
