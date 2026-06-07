import { test, expect, describe, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffold, deckFiles, VALID_NAME } from "./new";

describe("deckFiles (pure templates)", () => {
  test("emits a workspace-wired package.json + entry files", () => {
    const files = deckFiles("my-talk", "nocturne");
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        "package.json",
        "index.html",
        "build.ts",
        "server.ts",
        "bunfig.toml",
        "main.tsx",
        "slides/01-intro.tsx",
      ]),
    );
    const pkg = JSON.parse(files["package.json"]!);
    expect(pkg.name).toBe("my-talk"); // bare name — not the framework npm scope (ADR 0054)
    expect(pkg.dependencies["@liebstoeckel/engine"]).toBe("workspace:*");
    expect(pkg.devDependencies["@liebstoeckel/thumbnails"]).toBe("workspace:*");
    expect(files["build.ts"]).toContain('buildDeck } from "@liebstoeckel/thumbnails/build"');
    expect(files["index.html"]).toContain('data-brand="nocturne"');
    expect(files["main.tsx"]).toContain('brands={["nocturne"]}');
    expect(files["main.tsx"]).toContain("My Talk"); // title-cased from the name
  });

  test("ships a packing-safe files allowlist + .gitignore (ADR 0039)", () => {
    const files = deckFiles("my-talk");
    const pkg = JSON.parse(files["package.json"]!);
    // deny-by-default allowlist governs `bun pm pack` → embedded source
    expect(Array.isArray(pkg.files)).toBe(true);
    // bunfig.toml is default-ignored by pack; it MUST be allowlisted so eject's deck runs in dev
    expect(pkg.files).toContain("bunfig.toml");
    expect(pkg.files).toEqual(expect.arrayContaining(["index.html", "main.tsx", "build.ts", "slides"]));
    // a stray .env must never be tracked nor packed
    expect(pkg.files).not.toContain(".env");
    expect(files[".gitignore"]).toMatch(/^\.env$/m);
    expect(files[".gitignore"]).toContain("dist/");
  });

  test("--brand flows into the html + main", () => {
    const files = deckFiles("x", "acme");
    expect(files["index.html"]).toContain('data-brand="acme"');
    expect(files["main.tsx"]).toContain('brands={["acme"]}');
  });

  test("an org brand bakes its source + adds its @fontsource deps (ADR 0074)", () => {
    const files = deckFiles("x", "liebstoeckel", {}, {
      name: "acme",
      source: `import "@fontsource-variable/inter";\nexport default {};\n`,
      dependencies: ["@fontsource-variable/inter"],
    });
    // the brand source is written as owned source, wired in main.tsx
    expect(files["brands/acme.ts"]).toContain("@fontsource-variable/inter");
    expect(files["main.tsx"]).toContain('import orgBrand from "./brands/acme"');
    expect(files["main.tsx"]).toContain("brandThemes={[orgBrand]}");
    // its font package lands in package.json so `bun install` fetches the webfont
    const pkg = JSON.parse(files["package.json"]!);
    expect(pkg.dependencies["@fontsource-variable/inter"]).toBe("latest");
  });
});

describe("VALID_NAME", () => {
  test("accepts kebab-case", () => {
    expect(VALID_NAME.test("my-deck-1")).toBe(true);
  });
  test("rejects spaces / leading punctuation / slashes", () => {
    for (const n of ["My Deck", "_x", "-x", "x/y", ""]) expect(VALID_NAME.test(n)).toBe(false);
  });
});

describe("scaffold (writes to disk)", () => {
  let root: string | null = null;
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = null;
  });

  test("creates every file under <root>/<name>", async () => {
    root = mkdtempSync(join(tmpdir(), "pi-new-"));
    const res = await scaffold("demo-x", { dir: root, noOrgBrand: true });
    expect(res.dir).toBe(join(root, "demo-x"));
    for (const f of res.files) expect(existsSync(join(res.dir, f))).toBe(true);
    expect(JSON.parse(readFileSync(join(res.dir, "package.json"), "utf8")).name).toBe("demo-x");
  });

  test("--no-org-brand scaffolds the default brand with no baked brand file", async () => {
    root = mkdtempSync(join(tmpdir(), "pi-new-"));
    const res = await scaffold("plain", { dir: root, noOrgBrand: true });
    expect(res.brand).toBe("liebstoeckel");
    expect(res.files.some((f) => f.startsWith("brands/"))).toBe(false);
    expect(existsSync(join(res.dir, "brands"))).toBe(false);
    const html = readFileSync(join(res.dir, "index.html"), "utf8");
    expect(html).toContain('data-brand="liebstoeckel"');
    expect(readFileSync(join(res.dir, "main.tsx"), "utf8")).not.toContain("brandThemes");
  });

  test("refuses to overwrite an existing dir", async () => {
    root = mkdtempSync(join(tmpdir(), "pi-new-"));
    await scaffold("dup", { dir: root, noOrgBrand: true });
    await expect(scaffold("dup", { dir: root, noOrgBrand: true })).rejects.toThrow(/already exists/);
  });

  test("rejects an invalid name before touching disk", async () => {
    await expect(scaffold("Bad Name")).rejects.toThrow(/invalid deck name/);
  });
});
