// Catch the silent brand-font fallback at build time.
//
// A brand stores its type as a `font-family` *string* (`--brand-font-heading`,
// `--brand-font-body`, `--brand-font-mono`), but glyphs only ship if a usable
// `@font-face` is bundled. The build inlines that face's woff2 into the single
// file. When the bundled face is wrong (or absent), the browser silently falls
// back to a system font: no error, and the "what you ship is what you see"
// promise quietly breaks (the failure (internal ADR) describes; a real session shipped
// Noto Sans this way before a lucky `pdffonts` check caught it).
//
// Two failure modes, both detected from the final inlined CSS:
//
//  1. Subsetted faces (`subsetted`). Importing a Fontsource package's `index.css`
//     (or the bare package) pulls ~5 `@font-face` rules split by `unicode-range`.
//     Those subset faces do NOT survive the single-file inlining and never
//     register, the exact reported bug. The fix is one latin face with no
//     `unicode-range`, mirroring @liebstoeckel/theme's fonts.css. The house fonts
//     ship that way, so they never carry `unicode-range` and never trip this.
//
//  2. Unbundled brand fonts (`unbundled`). A `--brand-font-*` literal-CSS block
//     names a `"… Variable"` webfont (the self-hosted-font convention) that no
//     `@font-face` bundles at all, a typo or a forgotten import. Scoped to the
//     `"… Variable"` convention so a bare `"Inter"` leaning on a system install
//     isn't flagged. (Typed `brandThemes` generate their `--brand-font-*` at
//     runtime, so this arm covers the hand-written-CSS path; the subset arm and
//     the `pdffonts` verification in the skill cover the rest.)

const FACE_RE = /@font-face\s*\{([^}]*)\}/gi;
const FAMILY_DECL_RE = /font-family\s*:\s*([^;}]+)/i;
const BRAND_FONT_RE = /--brand-font-(?:heading|body|mono)\s*:\s*([^;}]+)/gi;

export interface BrandFontAudit {
  /** Families whose `@font-face` is a `unicode-range` subset that won't survive inlining. */
  subsetted: string[];
  /** `"… Variable"` families named by `--brand-font-*` with no `@font-face` at all. */
  unbundled: string[];
}

/** First family in a `font-family` value, unquoted + trimmed (the rest is the
 *  fallback stack). `"Nunito Sans Variable", system-ui` → `Nunito Sans Variable`. */
function primaryFamily(value: string): string {
  const first = value.split(",")[0] ?? "";
  return first.trim().replace(/^['"]|['"]$/g, "").trim();
}

function dedupe(pairs: Iterable<[string, string]>): string[] {
  const m = new Map<string, string>(); // lowercased key → declared casing
  for (const [key, declared] of pairs) if (!m.has(key)) m.set(key, declared);
  return [...m.values()];
}

/** Inspect a built deck's inlined CSS for brand fonts that won't render. */
export function auditBrandFonts(css: string): BrandFontAudit {
  const faces = new Set<string>(); // every @font-face family, lowercased
  const subsetted: [string, string][] = [];
  for (const m of css.matchAll(FACE_RE)) {
    const block = m[1] ?? "";
    const decl = FAMILY_DECL_RE.exec(block);
    if (!decl?.[1]) continue;
    const family = primaryFamily(decl[1]);
    faces.add(family.toLowerCase());
    if (/unicode-range\s*:/i.test(block)) subsetted.push([family.toLowerCase(), family]);
  }

  const unbundled: [string, string][] = [];
  for (const m of css.matchAll(BRAND_FONT_RE)) {
    const family = primaryFamily(m[1] ?? "");
    const key = family.toLowerCase();
    if (!/\bvariable$/i.test(family)) continue; // only the self-hosted-webfont convention
    if (faces.has(key)) continue; // a face bundles it (subset issues handled above)
    unbundled.push([key, family]);
  }

  return { subsetted: dedupe(subsetted), unbundled: dedupe(unbundled) };
}

/** Human-facing build warning for brand fonts that won't render, or null if clean.
 *  Printed by `bundleDeck`; kept pure so it is unit-tested without a real build. */
export function brandFontWarning(css: string): string | null {
  const { subsetted, unbundled } = auditBrandFonts(css);
  if (subsetted.length === 0 && unbundled.length === 0) return null;

  const lines = ["⚠ brand font won't render (text will fall back to a system font):"];
  if (subsetted.length) {
    lines.push(
      `  unicode-range subsets that don't survive inlining: ${subsetted.map((f) => `"${f}"`).join(", ")}`,
      `    → don't import a Fontsource package / its index.css; bundle one latin face`,
      `      (…-latin-wght-normal.woff2), mirroring @liebstoeckel/theme's fonts.css.`,
    );
  }
  if (unbundled.length) {
    lines.push(
      `  named by the brand but no @font-face bundles them: ${unbundled.map((f) => `"${f}"`).join(", ")}`,
      `    → add a latin @font-face for the family, or use a bundled house font.`,
    );
  }
  lines.push(`  See the skill's brand guide (references/brands.md → Fonts). Verify with pdffonts.`);
  return lines.join("\n");
}
