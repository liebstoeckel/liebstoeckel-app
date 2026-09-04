// Paper geometry for the PDF export: paper presets, length units, and the fit of
// the fixed 1280x720 slide canvas onto a printable page. Pure, so the CLI, the
// vector driver (CSS @page + CDP paper size), and the raster composer all agree
// on one definition of "the page" and are unit-testable without a browser.

/** CSS reference pixel: 96 per inch. */
export const PX_PER_IN = 96;
export const PX_PER_MM = PX_PER_IN / 25.4;
/** PDF user-space points per CSS px (72 pt/in over 96 px/in). */
export const PT_PER_PX = 72 / PX_PER_IN;

/** A print page in CSS px: the paper box plus the margin the slide keeps clear. */
export interface PageBox {
  width: number;
  height: number;
  margin: number;
}

export type Orientation = "landscape" | "portrait";

/** Paper presets as [short, long] side in mm. */
const PRESETS_MM: Record<string, readonly [number, number]> = {
  a3: [297, 420],
  a4: [210, 297],
  a5: [148, 210],
  letter: [8.5 * 25.4, 11 * 25.4],
  legal: [8.5 * 25.4, 14 * 25.4],
};

export const PAGE_SIZE_PRESETS = ["slide", ...Object.keys(PRESETS_MM)] as const;

/** Parse a CSS-style length ("10mm", "0.5in", "24px", "1cm") into CSS px. A bare
 *  number is rejected: paper is physical, so a unit is required. */
export function parseLength(spec: string): number {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(mm|cm|in|px)\s*$/i.exec(spec);
  if (!m) throw new Error(`bad length "${spec}" (expected <number><mm|cm|in|px>, e.g. 10mm)`);
  const n = Number(m[1]);
  switch (m[2].toLowerCase()) {
    case "mm":
      return n * PX_PER_MM;
    case "cm":
      return n * 10 * PX_PER_MM;
    case "in":
      return n * PX_PER_IN;
    default:
      return n;
  }
}

/**
 * Resolve a page-size spec to a paper box in CSS px, or `null` for `slide` (the
 * page is the slide canvas itself, today's default). Accepts a preset name or an
 * explicit `<w>x<h><unit>` such as `210x297mm` / `8.5x11in`. Presets default to
 * landscape (slides are landscape); an explicit size keeps its given order
 * unless an orientation is passed.
 */
export function parsePageSize(spec: string | undefined, orientation?: Orientation): { width: number; height: number } | null {
  const key = (spec ?? "slide").trim().toLowerCase();
  if (key === "slide") {
    if (orientation) throw new Error(`--orientation only applies to a paper page size, not "slide"`);
    return null;
  }
  let w: number;
  let h: number;
  const preset = PRESETS_MM[key];
  if (preset) {
    const [short, long] = preset;
    [w, h] = orientation === "portrait" ? [short, long] : [long, short];
    w *= PX_PER_MM;
    h *= PX_PER_MM;
  } else {
    const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(mm|cm|in|px)$/i.exec(key);
    if (!m) {
      throw new Error(
        `unknown page size "${spec}" (expected one of ${PAGE_SIZE_PRESETS.join("|")}, or <w>x<h><mm|cm|in|px> like 210x297mm)`,
      );
    }
    w = parseLength(m[1] + m[3]);
    h = parseLength(m[2] + m[3]);
    if (orientation === "landscape" && w < h) [w, h] = [h, w];
    if (orientation === "portrait" && w > h) [w, h] = [h, w];
  }
  return { width: w, height: h };
}

export interface FitRect {
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number;
}

/** Fit `inner` into `outer` minus `margin` on every side: aspect preserved, scaled
 *  to whatever fits (down or up), centered in the printable area. */
export function fitRect(inner: { w: number; h: number }, outer: { w: number; h: number }, margin = 0): FitRect {
  const availW = Math.max(0, outer.w - 2 * margin);
  const availH = Math.max(0, outer.h - 2 * margin);
  const scale = Math.min(availW / inner.w, availH / inner.h);
  const w = inner.w * scale;
  const h = inner.h * scale;
  return { x: (outer.w - w) / 2, y: (outer.h - h) / 2, w, h, scale };
}

export interface ExportPageArgs {
  pageSize?: string;
  orientation?: string;
  margin?: string;
  /** the `--width` flag, if the user passed one (conflicts with a paper page). */
  width?: number;
  format?: string;
}

export interface ExportPage {
  /** the paper page, or undefined when the page is the slide canvas. */
  page?: PageBox;
  /** human label for progress output, e.g. "A4 landscape". */
  label?: string;
}

/** Default clearance on paper: most printers can't print to the edge, and a small
 *  margin means the print dialog needs no "fit to page". */
export const DEFAULT_PAPER_MARGIN = "10mm";

/** Turn the export CLI's page flags into a `PageBox` (or nothing for `slide`),
 *  rejecting the combinations that would otherwise need a silent precedence rule. */
export function resolveExportPage(args: ExportPageArgs): ExportPage {
  const orientation = parseOrientation(args.orientation);
  const size = parsePageSize(args.pageSize, orientation);
  if (!size) {
    if (args.margin != null) throw new Error(`--margin only applies to a paper page size, not "slide"`);
    return {};
  }
  if (args.format === "png") throw new Error("--page-size applies to PDF export only (PNGs are always the slide canvas)");
  if (args.width != null) throw new Error("--width and --page-size are exclusive: a paper page sizes the slide to fit");
  const margin = parseLength(args.margin ?? DEFAULT_PAPER_MARGIN);
  if (2 * margin >= Math.min(size.width, size.height)) throw new Error(`--margin ${args.margin} leaves no printable area`);
  const key = (args.pageSize ?? "").trim().toLowerCase();
  const name = PRESETS_MM[key] ? key.toUpperCase() : key;
  const orient: Orientation = size.width >= size.height ? "landscape" : "portrait";
  return { page: { ...size, margin }, label: `${name} ${orient}` };
}

function parseOrientation(v: string | undefined): Orientation | undefined {
  if (v == null) return undefined;
  const o = v.trim().toLowerCase();
  if (o === "landscape" || o === "portrait") return o;
  throw new Error(`bad --orientation "${v}" (landscape|portrait)`);
}
