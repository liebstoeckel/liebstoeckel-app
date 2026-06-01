import { test, expect, describe } from "bun:test";
import { mkdtempSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { inflateSync } from "node:zlib";
import { parseSlideRange, pdfFromJpegPages, exportDeck } from "./export";
import { printDeckPdf, resolveChromium } from "./capture";

describe("parseSlideRange (pure, 1-based → 0-based)", () => {
  test("empty / undefined means every slide", () => {
    expect(parseSlideRange(undefined, 3)).toEqual([0, 1, 2]);
    expect(parseSlideRange("", 3)).toEqual([0, 1, 2]);
    expect(parseSlideRange("   ", 3)).toEqual([0, 1, 2]);
  });

  test("single slide", () => {
    expect(parseSlideRange("3", 5)).toEqual([2]);
    expect(parseSlideRange("1", 5)).toEqual([0]);
  });

  test("closed range", () => {
    expect(parseSlideRange("2-4", 5)).toEqual([1, 2, 3]);
  });

  test("open-ended ranges resolve against count", () => {
    expect(parseSlideRange("3-", 5)).toEqual([2, 3, 4]);
    expect(parseSlideRange("-3", 5)).toEqual([0, 1, 2]);
  });

  test("mixed list is de-duped and ordered", () => {
    expect(parseSlideRange("5,1,3", 6)).toEqual([0, 2, 4]);
    expect(parseSlideRange("1-3,2-4", 6)).toEqual([0, 1, 2, 3]);
  });

  test("rejects out-of-range and malformed specs", () => {
    expect(() => parseSlideRange("0", 5)).toThrow();
    expect(() => parseSlideRange("6", 5)).toThrow();
    expect(() => parseSlideRange("4-2", 5)).toThrow();
    expect(() => parseSlideRange("abc", 5)).toThrow();
  });

  test("zero-slide deck yields nothing", () => {
    expect(parseSlideRange(undefined, 0)).toEqual([]);
    expect(parseSlideRange("1", 0)).toEqual([]);
  });
});

describe("pdfFromJpegPages (pure, dependency-free)", () => {
  // a minimal valid-enough JPEG (SOI + EOI); we only assert structure, not decode
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const dec = new TextDecoder("latin1");

  test("emits a well-formed single-page PDF skeleton", () => {
    const pdf = pdfFromJpegPages([{ jpeg, w: 1280, h: 720 }], 1280, 720);
    const s = dec.decode(pdf);
    expect(s.startsWith("%PDF-1.4")).toBe(true);
    expect(s).toContain("/Type /Catalog");
    expect(s).toContain("/Type /Pages");
    expect(s).toContain("/Count 1");
    expect(s).toContain("/MediaBox [0 0 1280 720]");
    expect(s).toContain("/Filter /DCTDecode");
    expect(s).toContain("/Width 1280");
    expect(s).toContain("startxref");
    expect(s.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  test("one page per image and the raw JPEG bytes are embedded", () => {
    const pdf = pdfFromJpegPages(
      [
        { jpeg, w: 100, h: 50 },
        { jpeg, w: 100, h: 50 },
        { jpeg, w: 100, h: 50 },
      ],
      100,
      50,
    );
    const s = dec.decode(pdf);
    expect(s).toContain("/Count 3");
    // 2 fixed objects + 3 objects per page = 11 objects
    expect(s).toContain("/Size 12");
    expect((s.match(/\/Type \/Page\b/g) ?? []).length).toBe(3);
    // the JPEG SOI/EOI marker survives verbatim inside the stream
    expect(s).toContain("\xff\xd8\xff\xd9");
  });

  test("xref offsets point at real object headers", () => {
    const pdf = pdfFromJpegPages([{ jpeg, w: 10, h: 10 }], 10, 10);
    const s = dec.decode(pdf);
    const startxref = Number(s.match(/startxref\n(\d+)/)![1]);
    expect(s.slice(startxref, startxref + 4)).toBe("xref");
  });
});

// ── headless export (skips cleanly without Chromium) ─────────────────────────

let hasChromium = false;
try {
  resolveChromium();
  hasChromium = true;
} catch {
  hasChromium = false;
}

// Same stub deck as the thumbnails test: implements the capture protocol directly.
const STUB = `<!doctype html><html><head><meta charset=utf-8></head><body>
<div id=root style="position:fixed;inset:0;background:#0b1020"></div>
<script>
  const cap = window.__LIEBSTOECKEL_CAPTURE__;
  if (cap) {
    window.__LIEBSTOECKEL_SLIDE_COUNT__ = 4;
    const colors = ['#1e90ff','#22c55e','#f59e0b','#ef4444'];
    function render(i){
      document.getElementById('root').style.background = colors[i % colors.length];
      window.__LIEBSTOECKEL_CAPTURE_READY__ = -1;
      requestAnimationFrame(function(){ requestAnimationFrame(function(){ window.__LIEBSTOECKEL_CAPTURE_READY__ = i; }); });
    }
    window.addEventListener('liebstoeckel:capture', function(e){ render(e.detail); });
    render(cap.index || 0);
  }
</script></body></html>`;

describe.skipIf(!hasChromium)("exportDeck (headless)", () => {
  test("PNG: one file per slide, named + padded, full range", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lst-png-"));
    const r = await exportDeck(STUB, { format: "png", outDir: dir, baseName: "demo", scale: 1, settleMs: 0, width: 320 });
    expect(r.pages).toBe(4);
    expect(r.count).toBe(4);
    const files = readdirSync(dir).sort();
    expect(files).toEqual(["demo-slide-01.png", "demo-slide-02.png", "demo-slide-03.png", "demo-slide-04.png"]);
    for (const f of files) {
      const head = new Uint8Array(await Bun.file(join(dir, f)).arrayBuffer()).subarray(0, 4);
      expect([...head]).toEqual([0x89, 0x50, 0x4e, 0x47]); // PNG magic
    }
  }, 60_000);

  test("PNG: a slide range exports only those slides (names keep their 1-based number)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lst-png-range-"));
    const r = await exportDeck(STUB, { format: "png", outDir: dir, baseName: "demo", slides: "2-3", scale: 1, settleMs: 0, width: 320 });
    expect(r.pages).toBe(2);
    expect(readdirSync(dir).sort()).toEqual(["demo-slide-02.png", "demo-slide-03.png"]);
  }, 60_000);

  test("raster PDF: a single file whose page count matches the selection", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lst-pdf-"));
    const out = join(dir, "demo.pdf");
    const r = await exportDeck(STUB, { format: "pdf", pdfMode: "raster", outFile: out, baseName: "demo", slides: "1,3", scale: 1, settleMs: 0, width: 320 });
    expect(r.pages).toBe(2);
    expect(existsSync(out)).toBe(true);
    const s = new TextDecoder("latin1").decode(new Uint8Array(await Bun.file(out).arrayBuffer()));
    expect(s.startsWith("%PDF-1.4")).toBe(true);
    expect(s).toContain("/Count 2");
  }, 60_000);
});

// A stub deck that implements the PRINT protocol directly (no engine), so the
// vector driver is tested in isolation: it reports a count, lays out the selected
// slides as real DOM text, and echoes the select token into PRINT_READY.
// Crucially this stub reproduces the deck's *fullscreen* CSS (html,body fill the
// viewport and clip overflow) — the condition that made page.pdf() emit a single
// clipped page until PrintView overrode it. The page-count assertion guards that.
const PRINT_STUB = `<!doctype html><html><head><meta charset=utf-8>
<style>html,body{height:100%;margin:0;overflow:hidden}</style></head><body>
<div id=root></div>
<script>
  if (window.__LIEBSTOECKEL_PRINT__) {
    window.__LIEBSTOECKEL_SLIDE_COUNT__ = 5;
    function paint(sel){
      var root = document.getElementById('root');
      root.innerHTML = '';
      // mirror PrintView's print reset so the document can grow and paginate
      var st = document.createElement('style');
      st.textContent = 'html,body{height:auto!important;overflow:visible!important}#root{height:auto!important;overflow:visible!important;position:static!important}[data-print-page]{break-inside:avoid}';
      root.appendChild(st);
      sel.indices.forEach(function(i, n){
        var d = document.createElement('div');
        d.setAttribute('data-print-page','');
        d.style.cssText = 'position:relative;width:1280px;height:720px;overflow:hidden;break-after:' + (n < sel.indices.length-1 ? 'page' : 'auto');
        d.textContent = 'Slide number ' + (i+1) + ' selectable body text';
        root.appendChild(d);
      });
      window.__LIEBSTOECKEL_PRINT_READY__ = -1;
      requestAnimationFrame(function(){ requestAnimationFrame(function(){ window.__LIEBSTOECKEL_PRINT_READY__ = sel.token; }); });
    }
    window.addEventListener('liebstoeckel:print-select', function(e){ paint(e.detail); });
  }
</script></body></html>`;

describe.skipIf(!hasChromium)("printDeckPdf (vector, headless)", () => {
  function textOps(pdf: Uint8Array): number {
    const s = new TextDecoder("latin1").decode(pdf);
    let ops = 0;
    const re = /stream\r?\n/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      const start = m.index + m[0].length;
      const end = s.indexOf("endstream", start);
      if (end < 0) continue;
      try {
        ops += (inflateSync(pdf.subarray(start, end)).toString("latin1").match(/\b(Tj|TJ)\b/g) ?? []).length;
      } catch {
        /* not a flate stream */
      }
    }
    return ops;
  }

  test("produces a multi-page PDF with a selectable text layer for the chosen slides", async () => {
    const { pdf, count, pages } = await printDeckPdf(PRINT_STUB, {
      settleMs: 0,
      selectIndices: (n) => parseSlideRange("1,3,5", n),
    });
    expect(count).toBe(5);
    expect(pages).toBe(3);
    expect(new TextDecoder("latin1").decode(pdf.subarray(0, 8))).toBe("%PDF-1.4");
    // real DOM text → embedded fonts + text-show operators (not a raster image)
    expect(textOps(pdf)).toBeGreaterThan(0);
    // one page per selected slide — regression guard against the fullscreen-CSS clip
    // that made page.pdf() emit a single page (the stub reproduces that CSS).
    const s = new TextDecoder("latin1").decode(pdf);
    expect(s).toContain("/Count 3");
  }, 60_000);
});
