// liebstoeckel add chart-text (usually arrives as a dependency of a chart)

/**
 * Deterministic text-fitting helpers shared by the registry charts. No DOM
 * measurement: widths are estimated from per-glyph classes, slightly padded,
 * so margins can be computed before render (SSR-safe, no reflow). A few px of
 * spare margin beats a clipped label, so estimates lean generous.
 */

const NARROW = /[iljtfr.,':;|!()[\] 1]/;
const WIDE = /[mwMW@%]/;
const HEAVY = /[A-Z0-9]/;

/** Estimated rendered width of `text` at `fontSize`, in px. */
export function approxTextWidth(text: string, fontSize: number): number {
  let units = 0;
  for (const ch of text) {
    if (NARROW.test(ch)) units += 0.36;
    else if (WIDE.test(ch)) units += 0.95;
    else if (HEAVY.test(ch)) units += 0.72;
    else units += 0.6;
  }
  // Safety pad calibrated against the widest catalog faces (custom themes swap
  // fonts freely); clipping is worse than a little spare margin.
  return units * fontSize * 1.14;
}

/** The widest of `labels` at `fontSize`, in px. */
export function widestWidth(labels: string[], fontSize: number): number {
  return labels.reduce((w, l) => Math.max(w, approxTextWidth(l, fontSize)), 0);
}

/** `text`, ellipsis-truncated so it fits `maxWidth` at `fontSize`. */
export function fitLabel(text: string, fontSize: number, maxWidth: number): string {
  if (approxTextWidth(text, fontSize) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && approxTextWidth(`${out.trimEnd()}…`, fontSize) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out.trimEnd()}…`;
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const grouped = new Intl.NumberFormat("en-US");

/** Compact human number: 1_240_000 -> "1.2M". */
export function compactNumber(v: number): string {
  return compact.format(v);
}

/** Axis/value number: grouped below 10k ("9,999"), compact from 10k ("12K"). */
export function axisNumber(v: number): string {
  return Math.abs(v) >= 10_000 ? compact.format(v) : grouped.format(v);
}

/** Point/x-axis number: NO digit grouping (years must read "2026", not "2,026"),
 *  compact from 10k. */
export function pointNumber(v: number): string {
  return Math.abs(v) >= 10_000 ? compact.format(v) : String(v);
}
