import { describe, expect, test } from "bun:test";
import { DEFAULT_BRANDS, missingBrandMessage } from "./brandCheck";
import { brands as themeBrands } from "@liebstoeckel/theme";

describe("missingBrandMessage", () => {
  test("a known brand passes", () => {
    expect(missingBrandMessage("nocturne", ["liebstoeckel", "nocturne"])).toBeNull();
  });

  test("a missing brand names itself, suggests the closest and lists the rest", () => {
    const msg = missingBrandMessage("nocturn", ["sunset", "nocturne", "liebstoeckel", "nocturne"]);
    expect(msg).toContain('brand "nocturn" is not defined');
    expect(msg).toContain('Did you mean "nocturne"?');
    expect(msg).toContain('Available brands: "liebstoeckel", "nocturne", "sunset".');
    expect(msg).toContain("brandThemes");
  });

  test("no suggestion when nothing is close", () => {
    const msg = missingBrandMessage("default", ["liebstoeckel", "acme"]);
    expect(msg).not.toContain("Did you mean");
    expect(msg).toContain('Available brands: "acme", "liebstoeckel".');
  });

  test("no known brands at all says so", () => {
    expect(missingBrandMessage("acme", [])).toContain("Available brands: none.");
  });
});

test("the default brand is one the theme ships", () => {
  const shipped = themeBrands.map((b) => b.name);
  for (const name of DEFAULT_BRANDS) expect(missingBrandMessage(name, shipped)).toBeNull();
});
