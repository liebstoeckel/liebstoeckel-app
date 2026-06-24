import { describe, expect, test } from "bun:test";
import { auditBrandFonts, brandFontWarning } from "./font-audit";

const face = (family: string, extra = "") =>
  `@font-face{font-family:${family};src:url("data:font/woff2;base64,AAAA") format("woff2");font-weight:200 1000;${extra}}`;
const subsetFace = (family: string) => face(family, "unicode-range:U+0000-00FF,U+0131,U+0152-0153");
const brand = (name: string, heading: string, body = heading, mono = '"JetBrains Mono Variable", ui-monospace') =>
  `[data-brand="${name}"]{--brand-bg:#fff;--brand-font-heading:${heading};--brand-font-body:${body};--brand-font-mono:${mono}}`;

describe("auditBrandFonts", () => {
  test("clean when every '… Variable' brand family has a single bundled latin face", () => {
    const css =
      face('"Schibsted Grotesk Variable"') +
      face('"JetBrains Mono Variable"') +
      brand("liebstoeckel", '"Schibsted Grotesk Variable", system-ui, sans-serif');
    expect(auditBrandFonts(css)).toEqual({ subsetted: [], unbundled: [] });
    expect(brandFontWarning(css)).toBeNull();
  });

  test("flags unicode-range subset faces (the index.css / reported bug)", () => {
    // fontsource index.css ships ~5 subset faces for the same family
    const css =
      subsetFace('"Nunito Sans Variable"') +
      subsetFace('"Nunito Sans Variable"') +
      brand("threedy", '"Nunito Sans Variable", system-ui, sans-serif');
    const audit = auditBrandFonts(css);
    expect(audit.subsetted).toEqual(["Nunito Sans Variable"]); // deduped, family present but unusable
    const warn = brandFontWarning(css);
    expect(warn).toContain("Nunito Sans Variable");
    expect(warn).toContain("unicode-range");
    expect(warn).toContain("latin");
  });

  test("flags a '… Variable' brand family with no @font-face at all", () => {
    const css = face('"JetBrains Mono Variable"') + brand("threedy", '"Space Grotesk Variable", system-ui');
    const audit = auditBrandFonts(css);
    expect(audit.unbundled).toEqual(["Space Grotesk Variable"]);
    expect(audit.subsetted).toEqual([]);
    expect(brandFontWarning(css)).toContain("no @font-face");
  });

  test("does not flag bare system-leaning families like 'Inter' (acme/sunset)", () => {
    const css = brand("acme", '"Inter", system-ui, sans-serif', '"Inter", system-ui', '"JetBrains Mono", ui-monospace');
    expect(auditBrandFonts(css)).toEqual({ subsetted: [], unbundled: [] });
  });

  test("a single latin face (no unicode-range) is fine even if matched case-insensitively", () => {
    const css =
      "@font-face{font-family:Nunito Sans Variable;src:url(data:font/woff2;base64,AA)}" +
      brand("threedy", '"nunito sans variable", system-ui', '"nunito sans variable", system-ui', '"JetBrains Mono", ui-monospace');
    expect(auditBrandFonts(css)).toEqual({ subsetted: [], unbundled: [] });
  });
});
