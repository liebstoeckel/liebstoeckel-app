import { describe, expect, test } from "bun:test";
import { fontPackagesFromSource, resolveOrg } from "./cloud";

describe("resolveOrg (ADR 0057)", () => {
  test("explicit --org wins and is stripped from rest", () => {
    const r = resolveOrg(["./dist/index.html", "--org", "acme", "--title", "X"], "stored");
    expect(r.org).toBe("acme");
    expect(r.rest).toEqual(["./dist/index.html", "--title", "X"]);
    // the org value must not leak into rest (else it'd be mistaken for the deck path)
    expect(r.rest).not.toContain("acme");
  });
  test("falls back to the stored default", () => {
    const r = resolveOrg(["./dist/index.html"], "stored");
    expect(r.org).toBe("stored");
    expect(r.rest).toEqual(["./dist/index.html"]);
  });
  test("undefined (personal) when no flag and no default", () => {
    expect(resolveOrg(["x"]).org).toBeUndefined();
  });
});

describe("fontPackagesFromSource (ADR 0074)", () => {
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
