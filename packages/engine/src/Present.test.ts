import { test, expect, describe } from "bun:test";
import { brandThemesCss, presenterViewRequested } from "./Present";
import { defineTheme, nocturne } from "@liebstoeckel/theme";

describe("presenterViewRequested", () => {
  test("standalone (no role): #presenter opens the presenter view", () => {
    expect(presenterViewRequested("#presenter", undefined)).toBe(true);
    expect(presenterViewRequested("", undefined)).toBe(false);
  });

  test("live presenter: #presenter opens the presenter view", () => {
    expect(presenterViewRequested("#presenter", "presenter")).toBe(true);
  });

  test("live viewer: #presenter is denied (no notes/console leak)", () => {
    expect(presenterViewRequested("#presenter", "viewer")).toBe(false);
    expect(presenterViewRequested("", "viewer")).toBe(false);
  });
});

describe("brandThemesCss", () => {
  test("empty string when no themes", () => {
    expect(brandThemesCss()).toBe("");
    expect(brandThemesCss([])).toBe("");
  });

  test("emits a [data-brand] block with the brand variables", () => {
    const css = brandThemesCss([nocturne]);
    expect(css).toContain('[data-brand="nocturne"]');
    expect(css).toContain("--brand-primary:");
    expect(css).toContain("--brand-font-heading:");
  });

  test("supports a deck's own defineTheme brand (no theme-package edit)", () => {
    const mine = defineTheme({
      name: "mine",
      colors: { bg: "#010203", surface: "#0a0a0a", text: "#ffffff", muted: "#888888", primary: "#ff0000", accent: "#00ff00", onPrimary: "#000000" },
      fonts: { heading: "A", body: "B", mono: "C" },
    });
    const css = brandThemesCss([mine]);
    expect(css).toContain('[data-brand="mine"]{');
    expect(css).toContain("--brand-primary:#ff0000");
    expect(css).toContain("--brand-bg:#010203");
  });

  test("concatenates multiple brands", () => {
    const css = brandThemesCss([nocturne, nocturne]);
    expect((css.match(/\[data-brand="nocturne"\]/g) ?? []).length).toBe(2);
  });
});
