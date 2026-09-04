import { test, expect, describe } from "bun:test";
import { PX_PER_MM, fitRect, parseLength, parsePageSize, resolveExportPage } from "./page-size";

const A4_LONG = 297 * PX_PER_MM; // 1122.5 px
const A4_SHORT = 210 * PX_PER_MM; // 793.7 px

describe("parseLength (pure)", () => {
  test("converts mm / cm / in / px at 96 dpi", () => {
    expect(parseLength("10mm")).toBeCloseTo(37.795, 2);
    expect(parseLength("1cm")).toBeCloseTo(37.795, 2);
    expect(parseLength("0.5in")).toBe(48);
    expect(parseLength("24px")).toBe(24);
    expect(parseLength(" 2 IN ")).toBe(192);
  });

  test("rejects unit-less and garbage", () => {
    expect(() => parseLength("10")).toThrow(/bad length/);
    expect(() => parseLength("ten mm")).toThrow(/bad length/);
    expect(() => parseLength("10pt")).toThrow(/bad length/);
  });
});

describe("parsePageSize (pure)", () => {
  test("slide (and undefined) means the canvas is the page", () => {
    expect(parsePageSize(undefined)).toBeNull();
    expect(parsePageSize("slide")).toBeNull();
    expect(parsePageSize(" Slide ")).toBeNull();
  });

  test("presets default to landscape, portrait swaps", () => {
    const l = parsePageSize("a4")!;
    expect(l.width).toBeCloseTo(A4_LONG, 3);
    expect(l.height).toBeCloseTo(A4_SHORT, 3);
    const p = parsePageSize("A4", "portrait")!;
    expect(p.width).toBeCloseTo(A4_SHORT, 3);
    expect(p.height).toBeCloseTo(A4_LONG, 3);
    expect(parsePageSize("a4", "landscape")).toEqual(l);
  });

  test("every preset resolves to px at 96 dpi", () => {
    expect(parsePageSize("letter", "portrait")).toEqual({ width: 816, height: 1056 });
    expect(parsePageSize("legal", "portrait")).toEqual({ width: 816, height: 1344 });
    const a3 = parsePageSize("a3", "portrait")!;
    expect(a3.width).toBeCloseTo(A4_LONG, 3);
    expect(a3.height).toBeCloseTo(420 * PX_PER_MM, 3);
    const a5 = parsePageSize("a5", "portrait")!;
    expect(a5.width).toBeCloseTo(148 * PX_PER_MM, 3);
    expect(a5.height).toBeCloseTo(A4_SHORT, 3);
  });

  test("explicit WxH with a unit keeps its order unless an orientation is given", () => {
    const p = parsePageSize("210x297mm")!;
    expect(p.width).toBeCloseTo(A4_SHORT, 3);
    expect(p.height).toBeCloseTo(A4_LONG, 3);
    const l = parsePageSize("210x297mm", "landscape")!;
    expect(l.width).toBeCloseTo(A4_LONG, 3);
    expect(parsePageSize("8.5x11in")).toEqual({ width: 816, height: 1056 });
    expect(parsePageSize("8.5x11in", "landscape")).toEqual({ width: 1056, height: 816 });
    expect(parsePageSize("1280x720px")).toEqual({ width: 1280, height: 720 });
  });

  test("rejects unknown presets, unit-less WxH, and orientation on slide", () => {
    expect(() => parsePageSize("tabloid")).toThrow(/unknown page size/);
    expect(() => parsePageSize("210x297")).toThrow(/unknown page size/);
    expect(() => parsePageSize("slide", "portrait")).toThrow(/orientation/);
  });
});

describe("fitRect (pure)", () => {
  const slide = { w: 1280, h: 720 };

  test("16:9 on A4 landscape fills the width inside the margin, bands top/bottom, centered", () => {
    const page = { w: A4_LONG, h: A4_SHORT };
    const m = 10 * PX_PER_MM;
    const r = fitRect(slide, page, m);
    expect(r.scale).toBeCloseTo((page.w - 2 * m) / 1280, 6);
    expect(r.w).toBeCloseTo(page.w - 2 * m, 6);
    expect(r.x).toBeCloseTo(m, 6);
    expect(r.h).toBeLessThan(page.h - 2 * m);
    expect(r.y).toBeCloseTo((page.h - r.h) / 2, 6);
    expect(r.y).toBeGreaterThan(m);
  });

  test("16:9 on A4 portrait fills the width and leaves the lower half free", () => {
    const page = { w: A4_SHORT, h: A4_LONG };
    const r = fitRect(slide, page, 0);
    expect(r.w).toBeCloseTo(page.w, 6);
    expect(r.h).toBeLessThan(page.h / 2);
    expect(r.x).toBe(0);
    expect(r.y).toBeCloseTo((page.h - r.h) / 2, 6);
  });

  test("scales down on a small page and up on a big one; always min of both ratios", () => {
    const a5 = fitRect(slide, { w: A4_SHORT, h: 148 * PX_PER_MM }, 0);
    expect(a5.scale).toBeLessThan(1);
    const a3 = fitRect(slide, { w: 420 * PX_PER_MM, h: A4_LONG }, 0);
    expect(a3.scale).toBeGreaterThan(1);
    const tall = fitRect(slide, { w: 4000, h: 720 }, 0);
    expect(tall.scale).toBe(1);
    expect(tall.x).toBe((4000 - 1280) / 2);
    expect(tall.y).toBe(0);
    const id = fitRect(slide, slide, 0);
    expect(id).toEqual({ x: 0, y: 0, w: 1280, h: 720, scale: 1 });
  });
});

describe("resolveExportPage (CLI flag resolution, pure)", () => {
  test("defaults: canvas page, no label", () => {
    expect(resolveExportPage({})).toEqual({});
    expect(resolveExportPage({ pageSize: "slide", width: 1920, format: "pdf" })).toEqual({});
  });

  test("a preset gets landscape + the 10mm default margin and a label", () => {
    const r = resolveExportPage({ pageSize: "a4", format: "pdf" });
    expect(r.label).toBe("A4 landscape");
    expect(r.page!.width).toBeCloseTo(A4_LONG, 3);
    expect(r.page!.margin).toBeCloseTo(10 * PX_PER_MM, 3);
    const p = resolveExportPage({ pageSize: "letter", orientation: "portrait", margin: "0.25in" });
    expect(p.label).toBe("LETTER portrait");
    expect(p.page).toEqual({ width: 816, height: 1056, margin: 24 });
    expect(resolveExportPage({ pageSize: "297x210mm" }).label).toBe("297x210mm landscape");
  });

  test("rejects the combinations that would need a precedence rule", () => {
    expect(() => resolveExportPage({ pageSize: "a4", width: 1920 })).toThrow(/exclusive/);
    expect(() => resolveExportPage({ pageSize: "a4", format: "png" })).toThrow(/PDF export only/);
    expect(() => resolveExportPage({ margin: "5mm" })).toThrow(/--margin/);
    expect(() => resolveExportPage({ orientation: "portrait" })).toThrow(/--orientation/);
    expect(() => resolveExportPage({ pageSize: "a4", orientation: "sideways" })).toThrow(/bad --orientation/);
    expect(() => resolveExportPage({ pageSize: "a4", margin: "200mm" })).toThrow(/no printable area/);
    expect(() => resolveExportPage({ pageSize: "a4", margin: "10" })).toThrow(/bad length/);
  });
});
