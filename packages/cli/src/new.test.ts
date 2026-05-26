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
    expect(pkg.name).toBe("@liebstoeckel/my-talk");
    expect(pkg.dependencies["@liebstoeckel/engine"]).toBe("workspace:*");
    expect(pkg.devDependencies["@liebstoeckel/thumbnails"]).toBe("workspace:*");
    expect(files["build.ts"]).toContain("buildDeckWithThumbnails");
    expect(files["index.html"]).toContain('data-brand="nocturne"');
    expect(files["main.tsx"]).toContain('brands={["nocturne"]}');
    expect(files["main.tsx"]).toContain("My Talk"); // title-cased from the name
  });

  test("--brand flows into the html + main", () => {
    const files = deckFiles("x", "acme");
    expect(files["index.html"]).toContain('data-brand="acme"');
    expect(files["main.tsx"]).toContain('brands={["acme"]}');
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
    const res = await scaffold("demo-x", { dir: root });
    expect(res.dir).toBe(join(root, "demo-x"));
    for (const f of res.files) expect(existsSync(join(res.dir, f))).toBe(true);
    expect(JSON.parse(readFileSync(join(res.dir, "package.json"), "utf8")).name).toBe("@liebstoeckel/demo-x");
  });

  test("refuses to overwrite an existing dir", async () => {
    root = mkdtempSync(join(tmpdir(), "pi-new-"));
    await scaffold("dup", { dir: root });
    await expect(scaffold("dup", { dir: root })).rejects.toThrow(/already exists/);
  });

  test("rejects an invalid name before touching disk", async () => {
    await expect(scaffold("Bad Name")).rejects.toThrow(/invalid deck name/);
  });
});
