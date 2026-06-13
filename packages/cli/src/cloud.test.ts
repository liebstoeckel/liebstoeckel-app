import { describe, expect, test } from "bun:test";
import { fontPackagesFromSource, resolveOrg, themeToTokens } from "./cloud";

describe("resolveOrg ((internal ADR))", () => {
  test("explicit --org wins over the stored default", () => {
    expect(resolveOrg({ org: "acme" }, "stored")).toBe("acme");
  });
  test("falls back to the stored default", () => {
    expect(resolveOrg({}, "stored")).toBe("stored");
  });
  test("undefined (personal) when no flag and no default", () => {
    expect(resolveOrg({})).toBeUndefined();
  });
});

describe("fontPackagesFromSource ((internal ADR))", () => {
  test("extracts the brand's @fontsource side-effect imports, deduped + sorted", () => {
    const src = `// header
import "@fontsource-variable/schibsted-grotesk";
import "@fontsource-variable/jetbrains-mono";
import { defineTheme } from "@liebstoeckel/theme";
export default defineTheme({});`;
    expect(fontPackagesFromSource(src)).toEqual([
      "@fontsource-variable/jetbrains-mono",
      "@fontsource-variable/schibsted-grotesk",
    ]);
  });
  test("no font imports → empty (e.g. an all-custom brand)", () => {
    expect(fontPackagesFromSource('import { defineTheme } from "@liebstoeckel/theme";')).toEqual([]);
  });
});

describe("themeToTokens (brand push, (internal ticket))", () => {
  test("flattens a defineTheme module incl. the viz palette", () => {
    const t = themeToTokens({
      name: "acme",
      colors: { bg: "#000", surface: "#111", text: "#fff", muted: "#888", primary: "#f80", accent: "#fa0", onPrimary: "#000" },
      fonts: { heading: "Inter", body: "Inter", mono: "JB" },
      viz: ["#111111", "#222222"],
      glow: { a: "#001", b: "#002" },
    });
    expect(t.viz).toEqual(["#111111", "#222222"]);
    expect(t.fontHeading).toBe("Inter");
    expect(t.glowA).toBe("#001");
  });
  test("omits viz when the theme has none (server fills the default)", () => {
    const t = themeToTokens({ colors: { bg: "#000" }, fonts: {} });
    expect("viz" in t).toBe(false);
  });
});
