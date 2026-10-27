import { describe, expect, test } from "bun:test";
import { esbuild } from "../esbuild-native.ts";
import { buildDeck, DeckBuildError } from "./build.ts";
import { DevCore } from "./dev.ts";
import { MemoryFiles } from "./files.ts";
import { hostedTree } from "./hosted.ts";
import { Resolver } from "./resolve.ts";
import { IMPORT_META_URL_PROBLEM, importMetaUrlBases, locateImportMetaUrlBase, newUrlCalls } from "./url-check.ts";

function tree(files: Record<string, string>): MemoryFiles {
  const m = new MemoryFiles();
  for (const [p, t] of Object.entries(files)) m.write(p, t);
  return m;
}

const HTML = '<!doctype html><html><body><script type="module" src="./main.ts"></script></body></html>';

describe("new URL(..., import.meta.url)", () => {
  test("finds the calls in code, past strings, templates and comments", () => {
    const src = 'const a = new URL("./a.svg", import.meta.url);\n// new URL("./b", import.meta.url)\nconst s = "new URL(x, y)";\nconst t = `new URL(${1})`;\nf(new URL(g("(", 1), base));';
    expect(newUrlCalls(src).map((c) => c.args)).toEqual(['"./a.svg", import.meta.url', 'g("(", 1), base']);
  });

  test("counts only what esbuild reads as code", async () => {
    expect(await importMetaUrlBases(esbuild, 'export const u = new URL("./a.svg", import.meta.url);', "ts")).toBe(1);
    expect(await importMetaUrlBases(esbuild, "export const u = new URL(`./${name}.svg`,\n  import.meta.url\n);", "ts")).toBe(1);
    // Mentions: a comment, a string, a code sample in a template, JSX text.
    expect(await importMetaUrlBases(esbuild, '// new URL("./a.svg", import.meta.url)\nexport const s = "new URL(\\"./a\\", import.meta.url)";', "ts")).toBe(0);
    expect(await importMetaUrlBases(esbuild, 'export const code = `const u = new URL("./a.svg", import.meta.url)`;', "ts")).toBe(0);
    expect(await importMetaUrlBases(esbuild, 'export const S = () => <p>Write new URL("./a.svg", import.meta.url) to point at a file</p>;', "tsx")).toBe(0);
    // import.meta.url on its own, or not as the base, is fine.
    expect(await importMetaUrlBases(esbuild, "console.log(import.meta.url, new URL(import.meta.url).pathname);", "ts")).toBe(0);
  });

  test("places the call exactly, or not at all", () => {
    expect(locateImportMetaUrlBase('const x = 1;\n  const u = new URL("./a.svg", import.meta.url);', 1)).toEqual({ line: 2, column: 12 });
    // The source shows a mention besides the call esbuild found: no guess.
    expect(locateImportMetaUrlBase('const u = new URL("./a.svg", import.meta.url);\nconst S = () => <p>new URL("./b", import.meta.url)</p>;', 1)).toBeNull();
  });

  test("is a build error in the deck's own code, with the file and line", async () => {
    const files = tree({
      "/deck/index.html": HTML,
      "/deck/main.ts": 'import { w } from "pkg";\nconsole.log(w);\nexport const logo = new URL("./logo.svg", import.meta.url);\n',
      "/deck/node_modules/pkg/package.json": JSON.stringify({ name: "pkg", main: "./index.js" }),
      "/deck/node_modules/pkg/index.js": 'export const w = new URL("./worker.js", import.meta.url);\n',
    });
    const err = await buildDeck({ files, esbuild, html: "/deck/index.html" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DeckBuildError);
    expect((err as DeckBuildError).messages).toEqual([{ text: IMPORT_META_URL_PROBLEM, file: "/deck/main.ts", line: 3, column: 21 }]);
  });

  test("a package keeps it, and a deck that only mentions it builds", async () => {
    const files = tree({
      "/deck/index.html": HTML,
      "/deck/main.ts": 'import { w } from "pkg";\n// new URL("./logo.svg", import.meta.url) would not work here\nconsole.log(w, "new URL(x, import.meta.url)");\n',
      "/deck/node_modules/pkg/package.json": JSON.stringify({ name: "pkg", main: "./index.js" }),
      "/deck/node_modules/pkg/index.js": 'export const w = new URL("./worker.js", import.meta.url);\n',
    });
    const out = await buildDeck({ files, esbuild, html: "/deck/index.html" });
    expect(out.js).toContain("import.meta.url");
  });

  test("the dev core reports it as the module's problem", async () => {
    const files = tree({ "/deck/index.html": HTML, "/deck/main.ts": 'export const logo = new URL("./logo.svg", import.meta.url);\n' });
    const core = new DevCore({ esbuild, files, html: "/deck/index.html", base: "", deps: { imports: {}, css: [], candidates: [] } });
    await expect(core.module("/deck/main.ts")).rejects.toThrow("new URL(..., import.meta.url) does not work in a deck");
    expect(core.problems()).toEqual([{ text: IMPORT_META_URL_PROBLEM, file: "/deck/main.ts", line: 1, column: 21 }]);
  });
});

describe("the hosted tree", () => {
  test("gates reads, checks stylesheets and keeps the deck's package.json from redirecting", () => {
    const disk = tree({
      "/decks/a/package.json": JSON.stringify({ name: "a", imports: { "#x": "./main.ts" } }),
      "/decks/a/main.ts": "",
      "/decks/a/bad.css": "@plugin 'x';",
      "/decks/b/secret.ts": "",
      "/node_modules/pkg/package.json": JSON.stringify({ name: "pkg", exports: { ".": "./i.js" } }),
      "/node_modules/pkg/i.js": "",
    });
    const hosted = hostedTree(disk, { deckRoot: "/decks/a", trustedRoots: ["/node_modules"] });
    expect(hosted.files.read("/decks/a/main.ts")).not.toBeNull();
    expect(() => hosted.files.read("/decks/b/secret.ts")).toThrow(/not allowed/);
    expect(() => hosted.files.read("/decks/a/bad.css")).toThrow(/@plugin/);
    const resolver = new Resolver(hosted.files, hosted.resolver);
    expect(resolver.resolve("#x", "/decks/a")).toBeNull();
    expect(resolver.resolve("pkg", "/decks/a")).toEqual({ path: "/node_modules/pkg/i.js" });
  });
});
